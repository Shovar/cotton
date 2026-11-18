import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";

import { ApiError, apiGet, apiSend } from "../../api/client";
import type { TerminalRecord, ServerEvent } from "../../api/types";
import { ws, type ConnectionStatus } from "../../api/ws";
import { useStore } from "../../state/store";
import { TerminalGroup, type TerminalGroupRecord } from "./TerminalGroup";
import { TerminalBody } from "./TerminalBody";
import { useTerminalStore } from "./terminalStore";

const DEFAULT_GROUP_ID = "default";
const WORKSPACE_STORAGE_KEY = "cotton-terminal-workspace";

interface TerminalWorkspaceState {
  groups: TerminalGroupRecord[];
  selectedGroupId: string;
  activeTerminalByGroup: Record<string, string | null>;
  minimizedIds: string[];
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

function createDefaultWorkspaceState(): TerminalWorkspaceState {
  return {
    groups: [{ id: DEFAULT_GROUP_ID, name: "Default", terminalIds: [] }],
    selectedGroupId: DEFAULT_GROUP_ID,
    activeTerminalByGroup: {},
    minimizedIds: [],
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

    return {
      groups,
      selectedGroupId,
      activeTerminalByGroup,
      minimizedIds,
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
  const [sessionsReconciled, setSessionsReconciled] = useState(false);
  const attachedTerminalIds = useRef(new Set<string>());
  const reconciliationGeneration = useRef(0);
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

  const removeTerminal = useCallback((terminalId: string) => {
    const store = useTerminalStore.getState();
    store.detach(terminalId);
    store.remove(terminalId);
    attachedTerminalIds.current.delete(terminalId);
    setGroups((current) =>
      current.map((group) =>
        group.terminalIds.includes(terminalId)
          ? {
              ...group,
              terminalIds: group.terminalIds.filter((id) => id !== terminalId),
            }
          : group,
      ),
    );
    setMinimizedIds((ids) => ids.filter((id) => id !== terminalId));
    setActiveTerminalByGroup((current) =>
      Object.values(current).includes(terminalId)
        ? Object.fromEntries(
            Object.entries(current).filter(([, id]) => id !== terminalId),
          )
        : current,
    );
  }, []);

  const reconcileSessions = useCallback(
    async (connection?: ConnectionStatus) => {
      const generation = ++reconciliationGeneration.current;
      try {
        const current = await apiGet<TerminalRecord[]>("/api/terminals");
        if (generation !== reconciliationGeneration.current) {
          return;
        }

        const liveIds = new Set(current.map((record) => record.spec.id));
        useTerminalStore.getState().reconcile(current);
        addRecordsToGroups(current, true);
        setMinimizedIds((ids) => ids.filter((id) => liveIds.has(id)));
        setActiveTerminalByGroup((currentActive) =>
          Object.fromEntries(
            Object.entries(currentActive).filter(
              ([, id]) => id === null || liveIds.has(id),
            ),
          ),
        );
        if (connection) {
          useTerminalStore.getState().setConnection(connection);
        }
        setError(null);
        setSessionsReconciled(true);
      } catch (caught: unknown) {
        if (generation === reconciliationGeneration.current) {
          setError(errorMessage(caught));
        }
      }
    },
    [addRecordsToGroups],
  );

  useEffect(() => {
    let active = true;
    const removeEventHandler = ws.onEvent((event: ServerEvent) => {
      if (event.type === "terminal.state") {
        addRecordsToGroups([event.data]);
      } else if (event.type === "terminal.removed") {
        removeTerminal(event.data.id);
      }
      useTerminalStore.getState().applyServerEvent(event);
    });
    const handleStatus = (status: ConnectionStatus) => {
      const store = useTerminalStore.getState();
      if (status === "open") {
        setSessionsReconciled(false);
        void reconcileSessions(status);
      } else {
        if (store.connection === "open") {
          reconciliationGeneration.current += 1;
          setSessionsReconciled(false);
        }
        store.setConnection(status);
      }
    };
    const removeStatusHandler = ws.onStatus(handleStatus);
    ws.subscribe(["terminals"]);
    const connection = useStore.getState().connection;
    if (connection !== "open") {
      useTerminalStore.getState().setConnection(connection);
    }
    queueMicrotask(() => {
      if (active) {
        void reconcileSessions(connection === "open" ? connection : undefined);
      }
    });

    return () => {
      active = false;
      reconciliationGeneration.current += 1;
      removeEventHandler();
      removeStatusHandler();
    };
  }, [addRecordsToGroups, reconcileSessions, removeTerminal]);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const minimizedSet = useMemo(() => new Set(minimizedIds), [minimizedIds]);
  const selectedGroupTerminalIds = useMemo(
    () =>
      selectedGroup?.terminalIds.filter(
        (id) => records[id] && !minimizedSet.has(id),
      ) ?? [],
    [minimizedSet, records, selectedGroup?.terminalIds],
  );
  const activeSelectedId = activeTerminalByGroup[selectedGroupId] ?? null;
  const selectedId =
    activeSelectedId && selectedGroupTerminalIds.includes(activeSelectedId)
      ? activeSelectedId
      : (selectedGroupTerminalIds[0] ?? null);
  const attachedTargetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of groups) {
      for (const id of group.terminalIds) {
        if (!minimizedSet.has(id)) {
          ids.add(id);
        }
      }
    }
    return [...ids];
  }, [groups, minimizedSet]);

  useEffect(() => {
    if (!sessionsReconciled) {
      return;
    }
    const nextIds = new Set(attachedTargetIds);
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
  }, [attachedTargetIds, sessionsReconciled]);

  useEffect(
    () => () => {
      for (const id of attachedTerminalIds.current) {
        useTerminalStore.getState().detach(id);
      }
    },
    [],
  );

  const selectTerminal = (groupId: string, terminalId: string) => {
    if (groupId !== selectedGroupId) {
      selectedGroupIdRef.current = groupId;
      setSelectedGroupId(groupId);
    }
    setActiveTerminalByGroup((current) => ({ ...current, [groupId]: terminalId }));
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
    setActiveTerminalByGroup((current) => {
      const next = { ...current, [targetGroupId]: terminalId };
      if (next[source.id] === terminalId) {
        delete next[source.id];
      }
      return next;
    });
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
      selectTerminal(targetGroupId, record.spec.id);
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
      await apiSend<TerminalRecord>("DELETE", path);
      removeTerminal(record.spec.id);
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
        await apiSend<TerminalRecord>("DELETE", `${path}?force=true`);
        removeTerminal(record.spec.id);
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

  useEffect(() => {
    localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        groups,
        selectedGroupId,
        activeTerminalByGroup,
        minimizedIds,
      }),
    );
  }, [activeTerminalByGroup, groups, minimizedIds, selectedGroupId]);

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 p-3" aria-label="Terminal workspace">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold">Terminals</h2>
        <Button
          type="button"
          size="sm"
          disabled={!sessionsReconciled}
          onClick={() => void createTerminal()}
        >
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
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={!sessionsReconciled}
          >
            Run command
          </Button>
        </form>
      </header>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex min-h-0 flex-1 gap-3">
        <TerminalGroup
          groups={groups}
          selectedGroupId={selectedGroupId}
          records={records}
          activeTerminalByGroup={activeTerminalByGroup}
          minimizedIds={minimizedIds}
          onSelect={selectGroup}
          onCreate={createGroup}
          onRename={renameGroup}
          onDelete={deleteGroup}
          onSelectTerminal={selectTerminal}
          onRestoreTerminal={restoreTerminal}
          onCloseTerminal={(record) => void closeTerminal(record)}
          onMoveTerminal={moveTerminal}
        />
        <TerminalBody
          groups={groups}
          selectedGroupId={selectedGroupId}
          records={records}
          activeTerminalByGroup={activeTerminalByGroup}
          minimizedIds={minimizedIds}
          onSelect={(terminalId) => selectTerminal(selectedGroupId, terminalId)}
        />
      </div>
    </section>
  );
}
