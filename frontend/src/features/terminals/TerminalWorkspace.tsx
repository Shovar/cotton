import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

import { ApiError, apiGet, apiSend } from "../../api/client";
import type { TerminalRecord, ServerEvent } from "../../api/types";
import { ws } from "../../api/ws";
import { useStore } from "../../state/store";
import { TerminalGroup, type TerminalGroupRecord } from "./TerminalGroup";
import { TerminalList } from "./TerminalList";
import { TerminalView } from "./TerminalView";
import { useTerminalStore } from "./terminalStore";

const DEFAULT_GROUP_ID = "default";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not complete the action";
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

export function TerminalWorkspace() {
  const records = useTerminalStore((state) => state.records);
  const outputChunks = useTerminalStore((state) => state.outputChunks);
  const [groups, setGroups] = useState<TerminalGroupRecord[]>([
    { id: DEFAULT_GROUP_ID, name: "Default", terminalIds: [] },
  ]);
  const [selectedGroupId, setSelectedGroupId] = useState(DEFAULT_GROUP_ID);
  const selectedGroupIdRef = useRef(DEFAULT_GROUP_ID);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    return () => useTerminalStore.getState().detach(selectedId);
  }, [selectedId]);

  const selectTerminal = (terminalId: string) => {
    if (selectedId === terminalId) {
      return;
    }
    if (selectedId) {
      useTerminalStore.getState().detach(selectedId);
    }
    useTerminalStore.getState().attach(terminalId);
    setSelectedId(terminalId);
  };

  const selectGroup = (groupId: string) => {
    if (selectedGroupId === groupId) {
      return;
    }
    if (selectedId) {
      useTerminalStore.getState().detach(selectedId);
    }
    const nextId = groups.find((group) => group.id === groupId)?.terminalIds[0] ?? null;
    if (nextId) {
      useTerminalStore.getState().attach(nextId);
    }
    selectedGroupIdRef.current = groupId;
    setSelectedGroupId(groupId);
    setSelectedId(nextId);
  };

  const createGroup = (name: string) => {
    const group = { id: crypto.randomUUID(), name, terminalIds: [] };
    if (selectedId) {
      useTerminalStore.getState().detach(selectedId);
      setSelectedId(null);
    }
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
      setSelectedId(null);
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
    if (selectedId === terminalId && source.id === selectedGroupId) {
      useTerminalStore.getState().detach(terminalId);
      setSelectedId(null);
    }
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

  const selected = selectedId ? records[selectedId] : undefined;
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const groupRecords = (selectedGroup?.terminalIds ?? []).flatMap((id) =>
    records[id] ? [records[id]] : [],
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
          {selected && (
            <div className="min-h-0 flex-1">
              <TerminalView
                key={selected.spec.id}
                terminalId={selected.spec.id}
                outputChunks={outputChunks[selected.spec.id] ?? []}
                onInput={(data) =>
                  ws.send("terminal.input", { id: selected.spec.id, data: encodeBase64(data) })
                }
                onResize={(cols, rows) =>
                  ws.send("terminal.resize", { id: selected.spec.id, cols, rows })
                }
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
