import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type KeyboardEvent } from "react";

import { apiGet, apiSend } from "../../api/client";
import type { ProcessRecord, ProcessState } from "../../api/types";
import { useStore } from "../../state/store";
import { LogsPanel } from "./LogsPanel";
import { ProfilesPanel } from "./ProfilesPanel";

const CAN_STOP = new Set(["starting", "running"]);
const CAN_RESTART = new Set(["running", "exited", "failed"]);
const INACTIVE = new Set(["exited", "failed"]);
const STATE_LABELS: Record<ProcessState, string> = {
  starting: "Starting",
  running: "Running",
  stopping: "Stopping",
  exited: "Exited",
  failed: "Failed",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not complete the action";
}

export function ProcessesView() {
  const processes = useStore((state) => state.processes);
  const [selected, setSelected] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState("");
  const [terminal, setTerminal] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useQuery({
    queryKey: ["processes"],
    queryFn: async () => {
      const records = await apiGet<ProcessRecord[]>("/api/processes");
      for (const record of records) {
        useStore.getState().upsertProcess(record);
      }
      return records;
    },
  });

  const run = async (action: () => Promise<ProcessRecord>): Promise<boolean> => {
    try {
      useStore.getState().upsertProcess(await action());
      setError(null);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    }
  };

  const start = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }
    const target = terminal || null;
    if (target) {
      useStore.getState().clearLogs(target);
    }
    const started = await run(() =>
      apiSend<ProcessRecord>("POST", "/api/processes", {
        command: trimmed,
        ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
        ...(target ? { id: target } : {}),
      }),
    );
    if (!started) {
      return;
    }
    setCommand("");
    setTerminal("");
    setHistory((current) => [...current, trimmed]);
    setHistoryIndex(null);
  };

  const recall = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key !== "ArrowUp" && event.key !== "ArrowDown") || history.length === 0) {
      return;
    }
    event.preventDefault();
    if (event.key === "ArrowUp") {
      const next = historyIndex === null ? history.length - 1 : Math.max(historyIndex - 1, 0);
      setHistoryIndex(next);
      setCommand(history[next]);
      return;
    }
    if (historyIndex === null) {
      return;
    }
    const next = historyIndex + 1;
    setHistoryIndex(next >= history.length ? null : next);
    setCommand(next >= history.length ? "" : history[next]);
  };

  const stop = async (id: string) => {
    if (!window.confirm(`¿Parar el proceso ${id}?`)) {
      return;
    }
    await run(() => apiSend<ProcessRecord>("DELETE", `/api/processes/${encodeURIComponent(id)}`));
  };

  const restart = (id: string) =>
    run(() =>
      apiSend<ProcessRecord>("POST", `/api/processes/${encodeURIComponent(id)}/restart`),
    );

  const records = Object.values(processes);
  const finished = records.filter((record) => INACTIVE.has(record.state));

  return (
    <section className="processes-view" aria-label="Processes">
      <h2>Processes</h2>
      <form className="process-form terminal-prompt" onSubmit={start}>
        <label className="terminal-line">
          <span className="terminal-marker" aria-hidden="true">
            $
          </span>
          <input
            className="terminal-input"
            type="text"
            aria-label="Command"
            placeholder="ros2 run demo_nodes_cpp talker"
            autoComplete="off"
            spellCheck={false}
            value={command}
            onChange={(event) => {
              setCommand(event.target.value);
              setHistoryIndex(null);
            }}
            onKeyDown={recall}
          />
        </label>
        <label className="terminal-target">
          Terminal
          <select
            aria-label="Terminal"
            value={terminal}
            onChange={(event) => setTerminal(event.target.value)}
          >
            <option value="">New terminal</option>
            {finished.map((record) => (
              <option key={record.id} value={record.id}>
                {`${record.id} · ${record.spec.argv.join(" ")}`}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Run</button>
        <details className="process-advanced">
          <summary>Advanced options</summary>
          <label>
            Working directory
            <input
              type="text"
              value={cwd}
              onChange={(event) => setCwd(event.target.value)}
              placeholder="~/ros2_ws"
            />
          </label>
          <p className="process-hint">
            Where the command runs. Empty uses the directory that started ROS Studio.
          </p>
        </details>
      </form>
      {error && <p className="process-error">{error}</p>}
      {records.length === 0 ? (
        <p>No processes</p>
      ) : (
        <ul className="process-list">
          {records.map((record) => (
            <li key={record.id} className="process-card" data-state={record.state}>
              <div className="process-info">
                <div className="process-heading">
                  <strong>{record.id}</strong>
                  <span className="process-state" data-state={record.state}>
                    {STATE_LABELS[record.state]}
                  </span>
                  {record.exit_code !== null && (
                    <span className="process-exit">exit {record.exit_code}</span>
                  )}
                </div>
                <code className="process-argv">{record.spec.argv.join(" ")}</code>
                {record.spec.cwd && <p className="process-cwd">cwd {record.spec.cwd}</p>}
                {record.error && <p className="process-error">{record.error}</p>}
              </div>
              <div className="process-actions">
                <button
                  type="button"
                  aria-pressed={selected === record.id}
                  onClick={() => setSelected(record.id)}
                >
                  Logs
                </button>
                <button
                  type="button"
                  disabled={!CAN_RESTART.has(record.state)}
                  onClick={() => restart(record.id)}
                >
                  Reiniciar
                </button>
                <button
                  type="button"
                  disabled={!CAN_STOP.has(record.state)}
                  onClick={() => stop(record.id)}
                >
                  Parar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {selected && <LogsPanel key={selected} processId={selected} />}
      <ProfilesPanel processes={records} />
    </section>
  );
}
