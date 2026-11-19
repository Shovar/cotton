import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { apiGet, apiSend } from "../../api/client";
import type { ParamValue } from "../../api/types";

const SAVE_DELAY_MS = 300;
const REFRESH_MS = 3000;

type Draft = boolean | number | string;
type SaveStatus = "idle" | "saving" | "saved" | "error";

export function NodeParams({ nodeName }: { nodeName: string }) {
  const queryClient = useQueryClient();
  const params = useQuery({
    queryKey: ["params", nodeName],
    queryFn: () => apiGet<Record<string, ParamValue>>(paramsPath(nodeName)),
    refetchInterval: REFRESH_MS,
  });
  const entries = Object.entries(params.data ?? {});

  const applySaved = (name: string, saved: ParamValue) =>
    queryClient.setQueryData<Record<string, ParamValue>>(["params", nodeName], (current) =>
      current ? { ...current, [name]: saved } : current,
    );

  return (
    <section className="node-params" aria-label={`Parameters of ${nodeName}`}>
      <header className="node-params-header">
        <h2>Parameters of {nodeName}</h2>
        {params.data && <span className="graph-count">{entries.length}</span>}
        <span className="node-params-hint">Changes save as you type</span>
      </header>
      {params.isLoading && <p>Loading parameters…</p>}
      {params.error && <p role="alert">{params.error.message}</p>}
      {params.data && entries.length === 0 && <p>No parameters</p>}
      {entries.length > 0 && (
        <ul>
          {entries.map(([name, value]) => (
            <ParamRow
              key={name}
              nodeName={nodeName}
              name={name}
              value={value}
              onSaved={applySaved}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ParamRow({
  nodeName,
  name,
  value,
  onSaved,
}: {
  nodeName: string;
  name: string;
  value: ParamValue;
  onSaved: (name: string, value: ParamValue) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(value));
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const untouchable = useRef(false);

  // A poll must not overwrite what the user is typing.
  useEffect(() => {
    if (!untouchable.current) {
      setDraft(toDraft(value));
    }
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  if (value === null) {
    return (
      <li className="param-row">
        <span className="param-name">{name}</span>
        <span className="param-kind">—</span>
        <span className="param-control">Not editable</span>
        <span className="param-status" />
      </li>
    );
  }

  const save = async (next: Draft) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    let parsed: ParamValue;
    try {
      parsed = parseDraft(value, next);
    } catch {
      untouchable.current = true;
      setStatus("error");
      setMessage("Invalid value");
      return;
    }
    setStatus("saving");
    setMessage(null);
    try {
      await apiSend("PUT", `${paramsPath(nodeName)}/${encodeURIComponent(name)}`, {
        value: parsed,
      });
      untouchable.current = false;
      setStatus("saved");
      onSaved(name, parsed);
    } catch (caught) {
      untouchable.current = true;
      setStatus("error");
      setMessage(caught instanceof Error ? caught.message : "Could not save");
    }
  };

  const edit = (next: Draft) => {
    setDraft(next);
    untouchable.current = true;
    setStatus("idle");
    setMessage(null);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => void save(next), SAVE_DELAY_MS);
  };

  const editNow = (next: Draft) => {
    setDraft(next);
    untouchable.current = true;
    void save(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void save(draft);
    }
  };

  return (
    <li className="param-row" data-status={status}>
      <span className="param-name" title={name}>
        {name}
      </span>
      <span className="param-kind">{kindOf(value)}</span>
      <span className="param-control">
        {typeof value === "boolean" ? (
          <input
            type="checkbox"
            aria-label={name}
            className="param-toggle"
            checked={Boolean(draft)}
            onChange={(event) => editNow(event.target.checked)}
          />
        ) : (
          <input
            aria-label={name}
            type={typeof value === "number" ? "number" : "text"}
            inputMode={typeof value === "number" ? "decimal" : undefined}
            step={Number.isInteger(value) ? 1 : "any"}
            value={String(draft)}
            onChange={(event) => edit(event.target.value)}
            onKeyDown={onKeyDown}
          />
        )}
      </span>
      <span className="param-status" aria-live="polite">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : null}
      </span>
      {status === "error" && message && (
        <span role="alert" className="param-error">
          {message}
        </span>
      )}
    </li>
  );
}

function paramsPath(nodeName: string): string {
  return `/api/nodes/${encodeURIComponent(nodeName)}/params`;
}

function kindOf(value: ParamValue): string {
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "boolean") {
    return "bool";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "int" : "float";
  }
  return "string";
}

function toDraft(value: ParamValue): Draft {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  return String(value ?? "");
}

function parseDraft(value: ParamValue, draft: Draft): ParamValue {
  if (Array.isArray(value)) {
    const parsed: unknown = JSON.parse(String(draft));
    if (!Array.isArray(parsed)) {
      throw new TypeError("the parameter is an array");
    }
    return parsed as ParamValue;
  }
  if (typeof value === "boolean") {
    return Boolean(draft);
  }
  if (typeof value === "number") {
    const text = String(draft).trim();
    const parsed = Number(text);
    if (text === "" || Number.isNaN(parsed)) {
      throw new TypeError("the parameter is a number");
    }
    return parsed;
  }
  return String(draft);
}
