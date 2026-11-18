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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not complete the action";
}

export function TerminalWorkspace() {
  const records = useTerminalStore((state) => state.records);
  const [groups, setGroups] = useState<TerminalGroupRecord[]>([
    { id: DEFAULT_GROUP_ID, name: "Default", terminalIds: [] },
  ]);
  const [selectedGroupId, setSelectedGroupId] = useState(DEFAULT_GROUP_ID);
  const selectedGroupIdRef = useRef(DEFAULT_GROUP_ID);
  const [activeTerminalByGroup, setActiveTerminalByGroup] = useState<
    Record<string, string | null>
  >({});
  const selectedId = activeTerminalByGroup[selectedGroupId] ?? null;
  const dockApis = useRef(new Map<string, DockviewApi>());
  const attachedTerminalIds = useRef(new Set<string>());
  const [command, setCommand] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addRecordsToGroups = useCallback((incoming: TerminalRecord[]) => {
    setGroups((current) => {
      const currentIds = new Set(current.flatMap((group) => group.terminalIds));
      const additions = incoming
        .map((record) => record.spec.id)
        .filter((id) => !currentIds.has(id));
      const target = current.find((group) => group.id === selectedGroupIdRef.current) ?? current[0];
      if (additions.length === 0 || !target) {
        return current;
      }
      return current.map((group) =>
        group.id === target.id
          ? { ...group, terminalIds: [...group.terminalIds, ...additions] }
          : group,
      );
    });
  }, []);

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
          addRecordsToGroups(current);
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
  const selectedGroupTerminalIds = useMemo(
    () => selectedGroup?.terminalIds ?? [],
    [selectedGroup?.terminalIds],
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
    if (groups.length < 2 || groups.find((group) => group.id === groupId)?.terminalIds.length) {
      return;
    }
    const nextGroups = groups.filter((group) => group.id !== groupId);
    setGroups(nextGroups);
    if (selectedGroupId === groupId) {
      selectedGroupIdRef.current = nextGroups[0].id;
      setSelectedGroupId(nextGroups[0].id);
    }
  };

  const moveTerminal = (terminalId: string, targetGroupId: string) => {
    const source = groups.find((group) => group.terminalIds.includes(terminalId));
    if (!source || source.id === targetGroupId || !groups.some((group) => group.id === targetGroupId)) {
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

  const groupRecords = (selectedGroup?.terminalIds ?? []).flatMap((id) =>
    records[id] ? [records[id]] : [],
  );
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

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 p-3" aria-label="Terminal workspace">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold">Terminals</h2>
        <Button type="button" size="sm" onClick={() => void createTerminal()}>
          New shell
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
          <div className="relative min-h-0 min-w-0 flex-1">
            {groups.map((group) => (
              <TerminalGroupLayout
                key={group.id}
                groupId={group.id}
                terminalIds={group.terminalIds}
                isActive={group.id === selectedGroupId}
                onActivePanelChange={updateActivePanel}
                onApi={registerDockApi}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
