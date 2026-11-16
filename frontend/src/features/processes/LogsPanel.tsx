import { useEffect, useState } from "react";

import type { LogLine } from "../../api/types";
import { ws } from "../../api/ws";
import { useStore } from "../../state/store";

const LEVELS = ["all", "debug", "info", "warn", "error"] as const;
const EMPTY_LOGS: LogLine[] = [];

export function LogsPanel({
  processId,
  onClose,
}: {
  processId: string;
  onClose?: () => void;
}) {
  const lines = useStore((state) => state.logs[processId] ?? EMPTY_LOGS);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    ws.subscribe([`logs:${processId}`]);
  }, [processId]);

  const needle = search.trim().toLowerCase();
  const visible = lines.filter(
    (line) =>
      (level === "all" || line.level === level) &&
      line.text.toLowerCase().includes(needle),
  );

  const download = () => {
    const text = visible.map((line) => `${line.ts} ${line.stream} ${line.text}`).join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `logs-${processId}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="logs-panel" aria-label={`Logs for ${processId}`}>
      <div className="logs-header">
        <h2>Logs · {processId}</h2>
        {onClose && (
          <button type="button" aria-label="Close logs" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <div className="logs-toolbar">
        <select
          aria-label="Level"
          value={level}
          onChange={(event) => setLevel(event.target.value as (typeof LEVELS)[number])}
        >
          {LEVELS.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate === "all" ? "All" : candidate}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search logs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="button" onClick={download}>
          Download
        </button>
      </div>
      {visible.length === 0 ? (
        <p>No logs</p>
      ) : (
        <ol className="log-lines">
          {visible.map((line, index) => (
            <li key={index} className={`log-line log-${line.level ?? "raw"}`}>
              {line.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
