import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

import { ApiError, apiGet, apiSend } from "../../api/client";
import type { TerminalRecord, ServerEvent } from "../../api/types";
import { ws } from "../../api/ws";
import { useStore } from "../../state/store";
import { TerminalList } from "./TerminalList";
import { TerminalView } from "./TerminalView";
import { useTerminalStore } from "./terminalStore";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const removeEventHandler = ws.onEvent((event: ServerEvent) =>
      useTerminalStore.getState().applyServerEvent(event),
    );
    const removeStatusHandler = ws.onStatus((status) =>
      useTerminalStore.getState().setConnection(status),
    );
    ws.subscribe(["terminals"]);
    useTerminalStore.getState().setConnection(useStore.getState().connection);

    return () => {
      removeEventHandler();
      removeStatusHandler();
    };
  }, []);

  useEffect(() => {
    let active = true;
    void apiGet<TerminalRecord[]>("/api/terminals")
      .then((current) => {
        if (active) {
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
  }, []);

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

  const createTerminal = async (terminalCommand?: string) => {
    try {
      const record = await apiSend<TerminalRecord>("POST", "/api/terminals", {
        ...(terminalCommand ? { command: terminalCommand } : {}),
      });
      useTerminalStore.getState().applyServerEvent({ type: "terminal.state", data: record });
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
      <TerminalList
        records={Object.values(records)}
        selectedId={selectedId}
        onSelect={selectTerminal}
        onClose={(record) => void closeTerminal(record)}
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
    </section>
  );
}
