import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { apiGet, apiSend } from "../../api/client";
import type { ProcessRecord } from "../../api/types";
import { useStore } from "../../state/store";
import { LogsPanel } from "./LogsPanel";
import { ProfilesPanel } from "./ProfilesPanel";

const CAN_STOP = new Set(["starting", "running"]);
const CAN_RESTART = new Set(["running", "exited", "failed"]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo completar la acción";
}

export function ProcessesView() {
  const processes = useStore((state) => state.processes);
  const [selected, setSelected] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState("");
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

  const run = async (action: () => Promise<ProcessRecord>) => {
    try {
      useStore.getState().upsertProcess(await action());
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const start = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }
    await run(() =>
      apiSend<ProcessRecord>("POST", "/api/processes", {
        command: trimmed,
        ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
      }),
    );
    setCommand("");
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

  return (
    <section className="processes-view" aria-label="Procesos">
      <h2>Procesos</h2>
      <form className="process-form" onSubmit={start}>
        <label>
          Comando
          <input
            type="text"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
          />
        </label>
        <label>
          Trabajo (cwd)
          <input type="text" value={cwd} onChange={(event) => setCwd(event.target.value)} />
        </label>
        <button type="submit">Arrancar</button>
      </form>
      {error && <p className="process-error">{error}</p>}
      {records.length === 0 ? (
        <p>Sin procesos</p>
      ) : (
        <ul className="process-list">
          {records.map((record) => (
            <li key={record.id}>
              <div>
                <strong>{record.id}</strong>{" "}
                <span className="process-argv">{record.spec.argv.join(" ")}</span>
                <p>
                  <span className="process-state">{record.state}</span>
                  {record.exit_code !== null && (
                    <span className="process-exit">exit {record.exit_code}</span>
                  )}
                </p>
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
