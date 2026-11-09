import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiGet, apiSend } from "../../api/client";
import type { ParamValue } from "../../api/types";

type Draft = boolean | number | string;

export function NodeParams({ nodeName }: { nodeName: string }) {
  const queryClient = useQueryClient();
  const params = useQuery({
    queryKey: ["params", nodeName],
    queryFn: () => apiGet<Record<string, ParamValue>>(paramsPath(nodeName)),
  });

  return (
    <section className="node-params" aria-label={`Parámetros de ${nodeName}`}>
      <h2>Parámetros de {nodeName}</h2>
      {params.isLoading && <p>Cargando parámetros…</p>}
      {params.error && <p role="alert">{params.error.message}</p>}
      {params.data && Object.keys(params.data).length === 0 && <p>Sin parámetros</p>}
      {params.data && (
        <ul>
          {Object.entries(params.data).map(([name, value]) => (
            <ParamRow
              key={name}
              nodeName={nodeName}
              name={name}
              value={value}
              onSaved={() =>
                void queryClient.invalidateQueries({ queryKey: ["params", nodeName] })
              }
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
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (value === null) {
    return (
      <li className="param-row">
        <span className="param-name">{name}</span>
        <span>No editable</span>
      </li>
    );
  }

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiSend("PUT", `${paramsPath(nodeName)}/${encodeURIComponent(name)}`, {
        value: parseDraft(value, draft),
      });
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof SyntaxError
          ? "Valor no válido"
          : caught instanceof Error
            ? caught.message
            : "No se pudo guardar",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="param-row">
      <span className="param-name">{name}</span>
      {typeof value === "boolean" ? (
        <input
          type="checkbox"
          aria-label={name}
          checked={Boolean(draft)}
          onChange={(event) => setDraft(event.target.checked)}
        />
      ) : (
        <input
          aria-label={name}
          type={typeof value === "number" ? "number" : "text"}
          value={String(draft)}
          onChange={(event) => setDraft(event.target.value)}
        />
      )}
      <button
        type="button"
        disabled={saving}
        aria-label={`Guardar ${name}`}
        onClick={() => void save()}
      >
        Guardar
      </button>
      {error && <p role="alert">{error}</p>}
    </li>
  );
}

function paramsPath(nodeName: string): string {
  return `/api/nodes/${encodeURIComponent(nodeName)}/params`;
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
    return JSON.parse(String(draft)) as ParamValue;
  }
  if (typeof value === "boolean") {
    return Boolean(draft);
  }
  if (typeof value === "number") {
    return Number(draft);
  }
  return String(draft);
}
