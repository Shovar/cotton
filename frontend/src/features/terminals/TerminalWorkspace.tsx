import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { DockviewApi } from "dockview-react";

import { Button } from "@/components/ui/button";

import { ApiError, apiGet, apiSend } from "../../api/client";
import type { TerminalRecord, ServerEvent } from "../../api/types";
import { ws } from "../../api/ws";
import { useStore } from "../../state/store";
import {
  TerminalGroup,
  TerminalGroupLayout,
  type TerminalGroupRecord,
} from "./TerminalGroup";
import { TerminalList } from "./TerminalList";
import { useTerminalStore } from "./terminalStore";

const DEFAULT_GROUP_ID = "default";
const WORKSPACE_STORAGE_KEY = "cotton-terminal-workspace";
type TerminalDockLayout = ReturnType<DockviewApi["toJSON"]>;

interface TerminalWorkspaceState {
  groups: TerminalGroupRecord[];
  selectedGroupId: string;
  activeTerminalByGroup: Record<string, string | null>;
  minimizedIds: string[];
  dockLayouts: Record<string, TerminalDockLayout>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTerminalGroup(value: unknown): value is TerminalGroupRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.terminalIds) &&
    value.terminalIds.every((id) => typeof id === "string")
  );
}

function isDockviewLayout(value: unknown): value is TerminalDockLayout {
  return (
    isRecord(value) &&
    isRecord(value.grid) &&
    isRecord(value.grid.root) &&
    isRecord(value.panels)
  );
}

function createDefaultWorkspaceState(): TerminalWorkspaceState {
  return {
    groups: [{ id: DEFAULT_GROUP_ID, name: "Default", terminalIds: [] }],
    selectedGroupId: DEFAULT_GROUP_ID,
    activeTerminalByGroup: {},
    minimizedIds: [],
    dockLayouts: {},
  };
}

function readWorkspaceState(): TerminalWorkspaceState {
  try {
    const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!stored) {
      return createDefaultWorkspaceState();
    }

    const value: unknown = JSON.parse(stored);
    if (!isRecord(value) || value.version !== 1) {
      return createDefaultWorkspaceState();
    }

    const groups: TerminalGroupRecord[] = [];
    const groupIds = new Set<string>();
    const terminalIds = new Set<string>();
    if (Array.isArray(value.groups)) {
      for (const candidate of value.groups) {
        if (!isTerminalGroup(candidate) || groupIds.has(candidate.id)) {
          continue;
        }
        groupIds.add(candidate.id);
        const ids = candidate.terminalIds.filter((id) => {
          if (terminalIds.has(id)) {
            return false;
          }
          terminalIds.add(id);
          return true;
        });
        groups.push({ ...candidate, terminalIds: ids });
      }
    }
    if (groups.length === 0) {
      return createDefaultWorkspaceState();
    }

    const selectedGroupId =
      typeof value.selectedGroupId === "string" &&
      groupIds.has(value.selectedGroupId)
        ? value.selectedGroupId
        : groups[0].id;
    const activeTerminalByGroup: Record<string, string | null> = {};
    if (isRecord(value.activeTerminalByGroup)) {
      for (const [groupId, terminalId] of Object.entries(value.activeTerminalByGroup)) {
        if (
          groupIds.has(groupId) &&
          (terminalId === null || typeof terminalId === "string")
        ) {
          activeTerminalByGroup[groupId] = terminalId;
        }
      }
    }
    const minimizedIds = Array.isArray(value.minimizedIds)
      ? [...new Set(value.minimizedIds.filter((id): id is string => typeof id === "string"))]
      : [];
    const dockLayouts: Record<string, TerminalDockLayout> = {};
    if (isRecord(value.dockLayouts)) {
      for (const [groupId, layout] of Object.entries(value.dockLayouts)) {
        if (groupIds.has(groupId) && isDockviewLayout(layout)) {
          dockLayouts[groupId] = layout;
        }
      }
    }

    return {
      groups,
      selectedGroupId,
      activeTerminalByGroup,
      minimizedIds,
      dockLayouts,
    };
  } catch {
    return createDefaultWorkspaceState();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not complete the action";
}

export function TerminalWorkspace() {
  const records = useTerminalStore((state) => state.records);
  const [initialWorkspaceState] = useState(readWorkspaceState);
  const [groups, setGroups] = useState(initialWorkspaceState.groups);
  const [selectedGroupId, setSelectedGroupId] = useState(
    initialWorkspaceState.selectedGroupId,
  );
  const selectedGroupIdRef = useRef(initialWorkspaceState.selectedGroupId);
  const [activeTerminalByGroup, setActiveTerminalByGroup] = useState(
    initialWorkspaceState.activeTerminalByGroup,
  );
  const [minimizedIds, setMinimizedIds] = useState(initialWorkspaceState.minimizedIds);
  const [dockLayouts, setDockLayouts] = useState(initialWorkspaceState.dockLayouts);
  const selectedId = activeTerminalByGroup[selectedGroupId] ?? null;
  const dockApis = useRef(new Map<string, DockviewApi>());
  const attachedTerminalIds = useRef(new Set<string>());
  const [command, setCommand] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addRecordsToGroups = useCallback(
    (incoming: TerminalRecord[], removeStale = false) => {
      setGroups((current) => {
        const liveIds = new Set(incoming.map((record) => record.spec.id));
        const groupsWithoutStale = removeStale
          ? current.map((group) => {
              const terminalIds = group.terminalIds.filter((id) => liveIds.has(id));
              return terminalIds.length === group.terminalIds.length
                ? group
                : { ...group, terminalIds };
            })
          : current;
        const currentIds = new Set(
          groupsWithoutStale.flatMap((group) => group.terminalIds),
        );
        const additions = incoming
          .map((record) => record.spec.id)
          .filter((id) => !currentIds.has(id));
        const target =
          groupsWithoutStale.find(
            (group) => group.id === selectedGroupIdRef.current,
          ) ?? groupsWithoutStale[0];
        if (additions.length === 0 || !target) {
          return groupsWithoutStale;
        }
        return groupsWithoutStale.map((group) =>
          group.id === target.id
            ? { ...group, terminalIds: [...group.terminalIds, ...additions] }
            : group,
        );
      });
    },
    [],
  );

  useEffect(() => {
    const removeEventHandler = ws.onEvent((event: ServerEvent) => {
      if (event.type === "terminal.state") {
        addRecordsToGroups([event.data]);
      }
      useTerminalStore.getState().applyServerEvent(event);
    });
    const removeStatusHandler = ws.onStatus((status) =>
      useTerminalStore.getState().setConnection(status),
    );
    ws.subscribe(["terminals"]);
    useTerminalStore.getState().setConnection(useStore.getState().connection);

    return () => {
      removeEventHandler();
      removeStatusHandler();
    };
  }, [addRecordsToGroups]);

  useEffect(() => {
    let active = true;
    void apiGet<TerminalRecord[]>("/api/terminals")
      .then((current) => {
        if (active) {
          const knownRecords = new Map(
            Object.values(useTerminalStore.getState().records).map((record) => [
              record.spec.id,
              record,
            ]),
          );
          for (const record of current) {
            knownRecords.set(record.spec.id, record);
          }
          const reconciledRecords = [...knownRecords.values()];
          const liveIds = new Set(reconciledRecords.map((record) => record.spec.id));
          addRecordsToGroups(reconciledRecords, true);
          setMinimizedIds((ids) => ids.filter((id) => liveIds.has(id)));
          setActiveTerminalByGroup((currentActive) =>
            Object.fromEntries(
              Object.entries(currentActive).filter(
                ([, id]) => id === null || liveIds.has(id),
              ),
            ),
          );
          for (const record of current) {
            useTerminalStore.getState().applyServerEvent({
              type: "terminal.state",
              data: record,
            });
          }
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(errorMessage(caught));
        }
      });
    return () => {
      active = false;
    };
  }, [addRecordsToGroups]);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const minimizedSet = useMemo(() => new Set(minimizedIds), [minimizedIds]);
  const selectedGroupTerminalIds = useMemo(
    () => selectedGroup?.terminalIds.filter((id) => !minimizedSet.has(id)) ?? [],
    [minimizedSet, selectedGroup?.terminalIds],
  );

  useEffect(() => {
    const nextIds = new Set(selectedGroupTerminalIds);
    for (const id of attachedTerminalIds.current) {
      if (!nextIds.has(id)) {
        useTerminalStore.getState().detach(id);
      }
    }
    for (const id of nextIds) {
      if (!attachedTerminalIds.current.has(id)) {
        useTerminalStore.getState().attach(id);
      }
    }
    attachedTerminalIds.current = nextIds;
  }, [selectedGroupId, selectedGroupTerminalIds]);

  useEffect(
    () => () => {
      for (const id of attachedTerminalIds.current) {
        useTerminalStore.getState().detach(id);
      }
    },
    [],
  );

  const selectTerminal = (terminalId: string) => {
    setActiveTerminalByGroup((current) => ({
      ...current,
      [selectedGroupId]: terminalId,
    }));
    dockApis.current.get(selectedGroupId)?.getPanel(terminalId)?.api.setActive();
  };

  const selectGroup = (groupId: string) => {
    selectedGroupIdRef.current = groupId;
    setSelectedGroupId(groupId);
  };

  const createGroup = (name: string) => {
    const group = { id: crypto.randomUUID(), name, terminalIds: [] };
    setGroups((current) => [...current, group]);
    selectedGroupIdRef.current = group.id;
    setSelectedGroupId(group.id);
  };

  const renameGroup = (groupId: string, name: string) =>
    setGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, name } : group)),
    );

  const deleteGroup = (groupId: string) => {
    if (
      groups.length < 2 ||
      groups.find((group) => group.id === groupId)?.terminalIds.length
    ) {
      return;
    }
    const nextGroups = groups.filter((group) => group.id !== groupId);
    setGroups(nextGroups);
    setDockLayouts((current) => {
      const next = { ...current };
      delete next[groupId];
      return next;
    });
    setActiveTerminalByGroup((current) => {
      const next = { ...current };
      delete next[groupId];
      return next;
    });
    if (selectedGroupId === groupId) {
      selectedGroupIdRef.current = nextGroups[0].id;
      setSelectedGroupId(nextGroups[0].id);
    }
  };

  const moveTerminal = (terminalId: string, targetGroupId: string) => {
    const source = groups.find((group) => group.terminalIds.includes(terminalId));
    if (
      !source ||
      source.id === targetGroupId ||
      !groups.some((group) => group.id === targetGroupId)
    ) {
      return;
    }
    setGroups((current) =>
      current.map((group) => {
        if (group.id === source.id) {
          return {
            ...group,
            terminalIds: group.terminalIds.filter((id) => id !== terminalId),
          };
        }
        return group.id === targetGroupId
          ? { ...group, terminalIds: [...group.terminalIds, terminalId] }
          : group;
      }),
    );
  };

  const createTerminal = async (terminalCommand?: string) => {
    const targetGroupId = selectedGroupId;
    try {
      const record = await apiSend<TerminalRecord>("POST", "/api/terminals", {
        ...(terminalCommand ? { command: terminalCommand } : {}),
      });
      useTerminalStore.getState().applyServerEvent({ type: "terminal.state", data: record });
      setGroups((current) =>
        current.map((group) => ({
          ...group,
          terminalIds:
            group.id === targetGroupId
              ? group.terminalIds.includes(record.spec.id)
                ? group.terminalIds
                : [...group.terminalIds, record.spec.id]
              : group.terminalIds.filter((id) => id !== record.spec.id),
        })),
      );
      selectTerminal(record.spec.id);
      setError(null);
      setCommand("");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const runCommand = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = command.trim();
    if (trimmed) {
      void createTerminal(trimmed);
    }
  };

  const closeTerminal = async (record: TerminalRecord) => {
    const path = `/api/terminals/${encodeURIComponent(record.spec.id)}`;
    try {
      const closed = await apiSend<TerminalRecord>("DELETE", path);
      useTerminalStore.getState().applyServerEvent({ type: "terminal.state", data: closed });
      setError(null);
    } catch (caught) {
      if (
        !(caught instanceof ApiError) ||
        caught.status !== 409 ||
        caught.code !== "terminal_busy"
      ) {
        setError(errorMessage(caught));
        return;
      }
      if (!window.confirm(`Terminal ${record.spec.id} is running a command. Close it?`)) {
        return;
      }
      try {
        const closed = await apiSend<TerminalRecord>("DELETE", `${path}?force=true`);
        useTerminalStore.getState().applyServerEvent({ type: "terminal.state", data: closed });
        setError(null);
      } catch (retryError) {
        setError(errorMessage(retryError));
      }
    }
  };

  const minimizeTerminal = () => {
    if (selectedId) {
      setMinimizedIds((current) =>
        current.includes(selectedId) ? current : [...current, selectedId],
      );
    }
  };

  const restoreTerminal = (terminalId: string) => {
    setMinimizedIds((current) => current.filter((id) => id !== terminalId));
    const group = groups.find((candidate) => candidate.terminalIds.includes(terminalId));
    if (group) {
      setActiveTerminalByGroup((current) => ({
        ...current,
        [group.id]: terminalId,
      }));
      if (group.id !== selectedGroupId) {
        selectedGroupIdRef.current = group.id;
        setSelectedGroupId(group.id);
      }
    }
  };

  const groupRecords = (selectedGroup?.terminalIds ?? []).flatMap((id) =>
    records[id] ? [records[id]] : [],
  );
  const minimizedRecords = minimizedIds.flatMap((id) =>
    records[id] ? [records[id]] : [],
  );
  const updateLayout = useCallback((groupId: string, layout: TerminalDockLayout) => {
    setDockLayouts((current) => ({ ...current, [groupId]: layout }));
  }, []);
  const updateActivePanel = useCallback((groupId: string, terminalId: string | null) => {
    setActiveTerminalByGroup((current) =>
      current[groupId] === terminalId
        ? current
        : { ...current, [groupId]: terminalId },
    );
  }, []);
  const registerDockApi = useCallback(
    (groupId: string, api: DockviewApi | null) => {
      if (api) {
        dockApis.current.set(groupId, api);
      } else {
        dockApis.current.delete(groupId);
      }
    },
    [],
  );

  useEffect(() => {
    localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        groups,
        selectedGroupId,
        activeTerminalByGroup,
        minimizedIds,
        dockLayouts,
      }),
    );
  }, [activeTerminalByGroup, dockLayouts, groups, minimizedIds, selectedGroupId]);

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 p-3" aria-label="Terminal workspace">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold">Terminals</h2>
        <Button type="button" size="sm" onClick={() => void createTerminal()}>
          New shell
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!selectedId}
          onClick={minimizeTerminal}
        >
          Minimize terminal
        </Button>
        <form className="flex items-center gap-2" onSubmit={runCommand}>
          <label className="sr-only" htmlFor="terminal-command">
            Command
          </label>
          <input
            id="terminal-command"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="Command to run"
            className="h-8 min-w-48 rounded-md border border-input bg-background px-2 text-sm"
          />
          <Button type="submit" size="sm" variant="outline">
            Run command
          </Button>
        </form>
      </header>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex min-h-0 flex-1 gap-3">
        <TerminalGroup
          groups={groups}
          selectedGroupId={selectedGroupId}
          onSelect={selectGroup}
          onCreate={createGroup}
          onRename={renameGroup}
          onDelete={deleteGroup}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <TerminalList
            records={groupRecords}
            selectedId={selectedId}
            groupId={selectedGroupId}
            groups={groups}
            onSelect={selectTerminal}
            onClose={(record) => void closeTerminal(record)}
            onMove={moveTerminal}
          />
          {minimizedRecords.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" aria-label="Minimized terminals">
              <span className="text-sm text-muted-foreground">Minimized</span>
              {minimizedRecords.map((record) => (
                <Button
                  key={record.spec.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => restoreTerminal(record.spec.id)}
                >
                  Restore {record.spec.id}
                </Button>
              ))}
            </div>
          )}
          <div className="relative min-h-0 min-w-0 flex-1">
            {groups.map((group) => (
              <TerminalGroupLayout
                key={group.id}
                groupId={group.id}
                terminalIds={group.terminalIds.filter((id) => !minimizedSet.has(id))}
                isActive={group.id === selectedGroupId}
                initialLayout={dockLayouts[group.id] ?? null}
                onActivePanelChange={updateActivePanel}
                onApi={registerDockApi}
                onLayoutChange={updateLayout}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
