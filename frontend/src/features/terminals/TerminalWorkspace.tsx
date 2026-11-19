import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

import { ApiError, apiGet, apiSend } from "../../api/client";
import type { ServerEvent, TerminalRecord, Workspace } from "../../api/types";
import { ws, type ConnectionStatus } from "../../api/ws";
import { useStore } from "../../state/store";
import { TerminalBody } from "./TerminalBody";
import { TerminalSidebar } from "./TerminalSidebar";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { useTerminalStore } from "./terminalStore";
import { deleteWorkspace, listWorkspaces } from "./workspacesApi";

const WORKSPACE_STORAGE_KEY = "cotton-terminal-workspace";
const STORAGE_VERSION = 3;

interface TerminalWorkspaceState {
  selectedWorkspaceId: string | null;
  activeTerminalId: string | null;
  minimizedIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createDefaultState(): TerminalWorkspaceState {
  return { selectedWorkspaceId: null, activeTerminalId: null, minimizedIds: [] };
}

function readState(): TerminalWorkspaceState {
  try {
    const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!stored) {
      return createDefaultState();
    }
    const value: unknown = JSON.parse(stored);
    if (!isRecord(value) || value.version !== STORAGE_VERSION) {
      localStorage.removeItem(WORKSPACE_STORAGE_KEY);
      return createDefaultState();
    }
    return {
      selectedWorkspaceId:
        typeof value.selectedWorkspaceId === "string" ? value.selectedWorkspaceId : null,
      activeTerminalId:
        typeof value.activeTerminalId === "string" ? value.activeTerminalId : null,
      minimizedIds: Array.isArray(value.minimizedIds)
        ? [...new Set(value.minimizedIds.filter((id): id is string => typeof id === "string"))]
        : [],
    };
  } catch {
    return createDefaultState();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not complete the action";
}

function startedAt(record: TerminalRecord): string {
  return record.started_at ?? "";
}

export function TerminalWorkspace() {
  const records = useTerminalStore((state) => state.records);
  const [initialState] = useState(readState);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    initialState.selectedWorkspaceId,
  );
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(
    initialState.activeTerminalId,
  );
  const [minimizedIds, setMinimizedIds] = useState(initialState.minimizedIds);
  const [sessionsReconciled, setSessionsReconciled] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attachedTerminalIds = useRef(new Set<string>());
  const reconciliationGeneration = useRef(0);

  const removeTerminal = useCallback((terminalId: string) => {
    const store = useTerminalStore.getState();
    store.detach(terminalId);
    store.remove(terminalId);
    attachedTerminalIds.current.delete(terminalId);
    setMinimizedIds((ids) => ids.filter((id) => id !== terminalId));
    setActiveTerminalId((id) => (id === terminalId ? null : id));
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
      setActiveTerminalId((id) => (id === null || liveIds.has(id) ? id : null));
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
        setSelectedWorkspaceId((current) =>
          current && available.some((workspace) => workspace.id === current)
            ? current
            : (available[0]?.id ?? null),
        );
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

  const workspaceRecords = useMemo(
    () =>
      Object.values(records)
        .filter((record) => record.spec.workspace_id === selectedWorkspaceId)
        .sort((left, right) => startedAt(left).localeCompare(startedAt(right))),
    [records, selectedWorkspaceId],
  );
  const minimizedSet = useMemo(() => new Set(minimizedIds), [minimizedIds]);
  const mountedIds = useMemo(
    () =>
      workspaceRecords
        .filter((record) => !minimizedSet.has(record.spec.id))
        .map((record) => record.spec.id),
    [minimizedSet, workspaceRecords],
  );
  const selectedId =
    activeTerminalId && mountedIds.includes(activeTerminalId)
      ? activeTerminalId
      : (mountedIds[0] ?? null);
  const selectedWorkspace = workspaces.find(
    (workspace) => workspace.id === selectedWorkspaceId,
  );

  useEffect(() => {
    if (!sessionsReconciled) {
      return;
    }
    const nextIds = new Set(mountedIds);
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
  }, [mountedIds, sessionsReconciled]);

  useEffect(
    () => () => {
      for (const id of attachedTerminalIds.current) {
        useTerminalStore.getState().detach(id);
      }
    },
    [],
  );

  useEffect(() => {
    localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        selectedWorkspaceId,
        activeTerminalId,
        minimizedIds,
      }),
    );
  }, [activeTerminalId, minimizedIds, selectedWorkspaceId]);

  const createTerminal = async () => {
    if (!selectedWorkspaceId) {
      return;
    }
    try {
      const record = await apiSend<TerminalRecord>("POST", "/api/terminals", {
        workspace_id: selectedWorkspaceId,
      });
      useTerminalStore.getState().applyServerEvent({ type: "terminal.state", data: record });
      setActiveTerminalId(record.spec.id);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
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
    setActiveTerminalId(terminalId);
  };

  const removeWorkspace = async (workspaceId: string) => {
    try {
      await deleteWorkspace(workspaceId);
      const remaining = workspaces.filter((workspace) => workspace.id !== workspaceId);
      setWorkspaces(remaining);
      if (workspaceId === selectedWorkspaceId) {
        setSelectedWorkspaceId(remaining[0]?.id ?? null);
      }
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const addWorkspace = (created: Workspace) => {
    setWorkspaces((current) => [...current, created]);
    setSelectedWorkspaceId(created.id);
    setDialogOpen(false);
    setError(null);
  };

  const canCreate = sessionsReconciled && Boolean(selectedWorkspaceId);

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 p-3" aria-label="Terminal workspace">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Terminals</h2>
        {selectedWorkspace && (
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {selectedWorkspace.path}
          </p>
        )}
        <Button type="button" size="sm" disabled={!canCreate} onClick={() => void createTerminal()}>
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
      </header>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex min-h-0 flex-1 gap-3">
        <TerminalSidebar
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          records={workspaceRecords}
          activeTerminalId={selectedId}
          minimizedIds={minimizedIds}
          onSelectWorkspace={setSelectedWorkspaceId}
          onAddWorkspace={() => setDialogOpen(true)}
          onDeleteWorkspace={(id) => void removeWorkspace(id)}
          onSelectTerminal={setActiveTerminalId}
          onRestoreTerminal={restoreTerminal}
          onCloseTerminal={(record) => void closeTerminal(record)}
        />
        <TerminalBody
          records={workspaceRecords}
          activeTerminalId={selectedId}
          minimizedIds={minimizedIds}
          onSelect={setActiveTerminalId}
        />
      </div>
      {dialogOpen && (
        <WorkspaceDialog onClose={() => setDialogOpen(false)} onCreated={addWorkspace} />
      )}
    </section>
  );
}
