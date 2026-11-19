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
import type {
  TerminalGroup,
  TerminalRecord,
  ServerEvent,
  Workspace,
  WorkspaceCommand,
} from "../../api/types";
import { ws, type ConnectionStatus } from "../../api/ws";
import { useStore } from "../../state/store";
import { CommandBar } from "./CommandBar";
import { TerminalGroup as TerminalGroupPanel, type TerminalGroupRecord } from "./TerminalGroup";
import { TerminalBody } from "./TerminalBody";
import { useTerminalStore } from "./terminalStore";
import {
  createCommand,
  deleteCommand,
  listCommands,
  runCommand as runSavedCommand,
  updateCommand,
  type CommandPatch,
} from "./workspaceCommandsApi";
import {
  createGroup,
  createWorkspace,
  deleteGroup,
  deleteWorkspace,
  listGroups,
  listWorkspaces,
  moveTerminal,
  renameGroup,
} from "./workspacesApi";

const WORKSPACE_STORAGE_KEY = "cotton-terminal-workspace";
const STORAGE_VERSION = 2;

interface TerminalWorkspaceState {
  selectedWorkspaceId: string | null;
  selectedGroupId: string | null;
  activeTerminalByGroup: Record<string, string | null>;
  minimizedIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createDefaultWorkspaceState(): TerminalWorkspaceState {
  return {
    selectedWorkspaceId: null,
    selectedGroupId: null,
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
    if (!isRecord(value) || value.version !== STORAGE_VERSION) {
      localStorage.removeItem(WORKSPACE_STORAGE_KEY);
      return createDefaultWorkspaceState();
    }
    return {
      selectedWorkspaceId:
        typeof value.selectedWorkspaceId === "string" ? value.selectedWorkspaceId : null,
      selectedGroupId:
        typeof value.selectedGroupId === "string" ? value.selectedGroupId : null,
      activeTerminalByGroup: isRecord(value.activeTerminalByGroup)
        ? Object.fromEntries(
            Object.entries(value.activeTerminalByGroup).filter(
              (entry): entry is [string, string | null] =>
                entry[1] === null || typeof entry[1] === "string",
            ),
          )
        : {},
      minimizedIds: Array.isArray(value.minimizedIds)
        ? [...new Set(value.minimizedIds.filter((id): id is string => typeof id === "string"))]
        : [],
    };
  } catch {
    return createDefaultWorkspaceState();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not complete the action";
}

function startedAt(record: TerminalRecord): string {
  return record.started_at ?? "";
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function TerminalWorkspace() {
  const records = useTerminalStore((state) => state.records);
  const [initialWorkspaceState] = useState(readWorkspaceState);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    initialWorkspaceState.selectedWorkspaceId,
  );
  const [groups, setGroups] = useState<TerminalGroup[]>([]);
  const [commands, setCommands] = useState<WorkspaceCommand[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    initialWorkspaceState.selectedGroupId,
  );
  const [activeTerminalByGroup, setActiveTerminalByGroup] = useState(
    initialWorkspaceState.activeTerminalByGroup,
  );
  const [minimizedIds, setMinimizedIds] = useState(initialWorkspaceState.minimizedIds);
  const [sessionsReconciled, setSessionsReconciled] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const attachedTerminalIds = useRef(new Set<string>());
  const groupsGeneration = useRef(0);
  const reconciliationGeneration = useRef(0);
  const [command, setCommand] = useState("");
  const [error, setError] = useState<string | null>(null);

  const removeTerminal = useCallback((terminalId: string) => {
    const store = useTerminalStore.getState();
    store.detach(terminalId);
    store.remove(terminalId);
    attachedTerminalIds.current.delete(terminalId);
    setMinimizedIds((ids) => ids.filter((id) => id !== terminalId));
    setActiveTerminalByGroup((current) =>
      Object.values(current).includes(terminalId)
        ? Object.fromEntries(
            Object.entries(current).filter(([, id]) => id !== terminalId),
          )
        : current,
    );
  }, []);

  const reconcileSessions = useCallback(async (connection?: ConnectionStatus) => {
    const generation = ++reconciliationGeneration.current;
    try {
      const current = await apiGet<TerminalRecord[]>("/api/terminals");
      if (generation !== reconciliationGeneration.current) {
        return;
      }
      const liveIds = new Set(current.map((record) => record.spec.id));
      useTerminalStore.getState().reconcile(current);
      setMinimizedIds((ids) => ids.filter((id) => liveIds.has(id)));
      setActiveTerminalByGroup((currentActive) =>
        Object.fromEntries(
          Object.entries(currentActive).filter(([, id]) => id === null || liveIds.has(id)),
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
  }, []);

  useEffect(() => {
    let active = true;
    const removeEventHandler = ws.onEvent((event: ServerEvent) => {
      if (event.type === "terminal.removed") {
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
    listWorkspaces()
      .then((available) => {
        if (!active) {
          return;
        }
        setWorkspaces(available);
        setSelectedWorkspaceId((current) => {
          if (current && available.some((workspace) => workspace.id === current)) {
            return current;
          }
          return available[0]?.id ?? null;
        });
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(errorMessage(caught));
        }
      });
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
  }, [reconcileSessions, removeTerminal]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }
    let active = true;
    const generation = ++groupsGeneration.current;
    listGroups(selectedWorkspaceId)
      .then((loaded) => {
        if (!active || generation !== groupsGeneration.current) {
          return;
        }
        setGroups(loaded);
        setSelectedGroupId((current) =>
          current && loaded.some((group) => group.id === current)
            ? current
            : (loaded[0]?.id ?? null),
        );
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(errorMessage(caught));
        }
      });
    return () => {
      active = false;
    };
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }
    let active = true;
    listCommands(selectedWorkspaceId)
      .then((loaded) => {
        if (active) {
          setCommands(loaded);
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
  }, [selectedWorkspaceId]);

  const refreshCommands = useCallback(async (workspaceId: string) => {
    setCommands(await listCommands(workspaceId));
  }, []);

  const refreshGroups = useCallback(async (workspaceId: string) => {
    const generation = ++groupsGeneration.current;
    const loaded = await listGroups(workspaceId);
    if (generation !== groupsGeneration.current) {
      return;
    }
    setGroups(loaded);
    setSelectedGroupId((current) =>
      current && loaded.some((group) => group.id === current)
        ? current
        : (loaded[0]?.id ?? null),
    );
  }, []);

  const viewGroups = useMemo<TerminalGroupRecord[]>(() => {
    const workspaceRecords = Object.values(records)
      .filter((record) => record.spec.workspace_id === selectedWorkspaceId)
      .sort((left, right) => startedAt(left).localeCompare(startedAt(right)));
    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      terminalIds: workspaceRecords
        .filter((record) => record.spec.group_id === group.id)
        .map((record) => record.spec.id),
    }));
  }, [groups, records, selectedWorkspaceId]);

  const selectedGroup = viewGroups.find((group) => group.id === selectedGroupId);
  const selectedGroupTerminalIds = selectedGroup?.terminalIds ?? [];
  const activeSelectedId = selectedGroupId
    ? (activeTerminalByGroup[selectedGroupId] ?? null)
    : null;
  const selectedId =
    activeSelectedId && selectedGroupTerminalIds.includes(activeSelectedId)
      ? activeSelectedId
      : (selectedGroupTerminalIds[0] ?? null);
  const minimizedSet = useMemo(() => new Set(minimizedIds), [minimizedIds]);
  const attachedTargetIds = useMemo(
    () =>
      viewGroups.flatMap((group) =>
        group.terminalIds.filter((id) => !minimizedSet.has(id)),
      ),
    [minimizedSet, viewGroups],
  );

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
    setSelectedGroupId(groupId);
    setActiveTerminalByGroup((current) => ({ ...current, [groupId]: terminalId }));
  };

  const createTerminal = async (terminalCommand?: string) => {
    if (!selectedWorkspaceId || !selectedGroupId) {
      return;
    }
    const workspaceId = selectedWorkspaceId;
    const targetGroupId = selectedGroupId;
    try {
      const record = await apiSend<TerminalRecord>("POST", "/api/terminals", {
        workspace_id: workspaceId,
        group_id: targetGroupId,
        ...(terminalCommand ? { command: terminalCommand } : {}),
      });
      useTerminalStore.getState().applyServerEvent({ type: "terminal.state", data: record });
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
    const record = records[terminalId];
    if (record) {
      selectTerminal(record.spec.group_id, terminalId);
    }
  };

  const addWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    const name = workspaceName.trim();
    const path = workspacePath.trim();
    if (!name || !path) {
      return;
    }
    try {
      const created = await createWorkspace(name, path);
      setWorkspaces((current) => [...current, created]);
      setSelectedWorkspaceId(created.id);
      setWorkspaceName("");
      setWorkspacePath("");
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const removeWorkspace = async () => {
    if (!selectedWorkspaceId) {
      return;
    }
    try {
      await deleteWorkspace(selectedWorkspaceId);
      const remaining = workspaces.filter(
        (workspace) => workspace.id !== selectedWorkspaceId,
      );
      setWorkspaces(remaining);
      setSelectedWorkspaceId(remaining[0]?.id ?? null);
      setGroups([]);
      setSelectedGroupId(null);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const addGroup = async (name: string) => {
    if (!selectedWorkspaceId) {
      return;
    }
    try {
      const created = await createGroup(selectedWorkspaceId, name);
      await refreshGroups(selectedWorkspaceId);
      setSelectedGroupId(created.id);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const renameSelectedGroup = async (groupId: string, name: string) => {
    if (!selectedWorkspaceId) {
      return;
    }
    try {
      await renameGroup(groupId, name);
      await refreshGroups(selectedWorkspaceId);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const removeGroup = async (groupId: string) => {
    if (!selectedWorkspaceId) {
      return;
    }
    try {
      await deleteGroup(groupId);
      await refreshGroups(selectedWorkspaceId);
      setActiveTerminalByGroup((current) => {
        const next = { ...current };
        delete next[groupId];
        return next;
      });
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const moveGroupTerminal = async (terminalId: string, targetGroupId: string) => {
    const record = records[terminalId];
    if (!record || record.spec.group_id === targetGroupId) {
      return;
    }
    try {
      const moved = await moveTerminal(terminalId, targetGroupId);
      useTerminalStore.getState().applyServerEvent({ type: "terminal.state", data: moved });
      setActiveTerminalByGroup((current) => {
        const next = { ...current, [targetGroupId]: terminalId };
        if (next[record.spec.group_id] === terminalId) {
          delete next[record.spec.group_id];
        }
        return next;
      });
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const addCommand = async (label: string, body: string, isStartup: boolean) => {
    if (!selectedWorkspaceId) {
      return;
    }
    try {
      await createCommand(selectedWorkspaceId, label, body, isStartup);
      await refreshCommands(selectedWorkspaceId);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const patchCommand = async (commandId: string, patch: CommandPatch) => {
    if (!selectedWorkspaceId) {
      return;
    }
    try {
      await updateCommand(commandId, patch);
      await refreshCommands(selectedWorkspaceId);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const removeCommand = async (commandId: string) => {
    if (!selectedWorkspaceId) {
      return;
    }
    try {
      await deleteCommand(commandId);
      await refreshCommands(selectedWorkspaceId);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const executeCommand = async (commandId: string) => {
    if (!selectedWorkspaceId) {
      return;
    }
    try {
      const record = await runSavedCommand(
        selectedWorkspaceId,
        commandId,
        selectedGroupId,
      );
      useTerminalStore.getState().applyServerEvent({ type: "terminal.state", data: record });
      selectTerminal(record.spec.group_id, record.spec.id);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const insertCommand = (body: string) => {
    if (!selectedId) {
      return;
    }
    ws.send("terminal.input", { id: selectedId, data: encodeBase64(body) });
  };

  useEffect(() => {
    localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        selectedWorkspaceId,
        selectedGroupId,
        activeTerminalByGroup,
        minimizedIds,
      }),
    );
  }, [activeTerminalByGroup, minimizedIds, selectedGroupId, selectedWorkspaceId]);

  const canCreate = sessionsReconciled && Boolean(selectedWorkspaceId && selectedGroupId);

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 p-3" aria-label="Terminal workspace">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold">Terminals</h2>
        <label className="sr-only" htmlFor="terminal-workspace">
          ROS workspace
        </label>
        <select
          id="terminal-workspace"
          aria-label="ROS workspace"
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={selectedWorkspaceId ?? ""}
          onChange={(event) => setSelectedWorkspaceId(event.target.value || null)}
        >
          {workspaces.length === 0 && <option value="">No workspace</option>}
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <form className="flex items-center gap-2" onSubmit={addWorkspace}>
          <label className="sr-only" htmlFor="workspace-name">
            Workspace name
          </label>
          <input
            id="workspace-name"
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
            placeholder="Workspace name"
            className="h-8 w-32 rounded-md border border-input bg-background px-2 text-sm"
          />
          <label className="sr-only" htmlFor="workspace-path">
            Workspace path
          </label>
          <input
            id="workspace-path"
            value={workspacePath}
            onChange={(event) => setWorkspacePath(event.target.value)}
            placeholder="/path/to/workspace"
            className="h-8 w-56 rounded-md border border-input bg-background px-2 text-sm"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={!workspaceName.trim() || !workspacePath.trim()}
          >
            Add workspace
          </Button>
        </form>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!selectedWorkspaceId}
          onClick={() => void removeWorkspace()}
        >
          Delete workspace
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canCreate}
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
          <Button type="submit" size="sm" variant="outline" disabled={!canCreate}>
            Run command
          </Button>
        </form>
      </header>
      <CommandBar
        commands={commands.filter(
          (command) => command.workspace_id === selectedWorkspaceId,
        )}
        onCreate={(label, body, isStartup) => void addCommand(label, body, isStartup)}
        onUpdate={(id, patch) => void patchCommand(id, patch)}
        onDelete={(id) => void removeCommand(id)}
        onRun={(id) => void executeCommand(id)}
        onInsert={insertCommand}
        disabled={!selectedWorkspaceId}
      />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex min-h-0 flex-1 gap-3">
        <TerminalGroupPanel
          groups={viewGroups}
          selectedGroupId={selectedGroupId ?? ""}
          records={records}
          activeTerminalByGroup={activeTerminalByGroup}
          minimizedIds={minimizedIds}
          onSelect={setSelectedGroupId}
          onCreate={(name) => void addGroup(name)}
          onRename={(id, name) => void renameSelectedGroup(id, name)}
          onDelete={(id) => void removeGroup(id)}
          onSelectTerminal={selectTerminal}
          onRestoreTerminal={restoreTerminal}
          onCloseTerminal={(record) => void closeTerminal(record)}
          onMoveTerminal={(terminalId, groupId) =>
            void moveGroupTerminal(terminalId, groupId)
          }
        />
        <TerminalBody
          groups={viewGroups}
          selectedGroupId={selectedGroupId ?? ""}
          records={records}
          activeTerminalByGroup={activeTerminalByGroup}
          minimizedIds={minimizedIds}
          onSelect={(terminalId) =>
            selectedGroupId && selectTerminal(selectedGroupId, terminalId)
          }
        />
      </div>
    </section>
  );
}
