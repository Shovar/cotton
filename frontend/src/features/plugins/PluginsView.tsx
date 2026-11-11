import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { apiGet, apiSend } from "../../api/client";
import type { PluginPanelSpec, PluginRecord, PluginState } from "../../api/types";
import { useStore } from "../../state/store";
import { PluginPanel } from "./PluginPanel";

const STATE_LABELS: Record<PluginState, string> = {
  discovered: "Descubierto",
  active: "Activo",
  stopped: "Detenido",
  error: "Error",
};

function panelFor(plugin: PluginRecord): PluginPanelSpec | undefined {
  return plugin.manifest?.panels.find((panel) => panel.type !== "native" && panel.url);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo completar la acción";
}

export function PluginsView() {
  const plugins = useStore((state) => state.plugins);
  const [viewer, setViewer] = useState<{ plugin: PluginRecord; panel: PluginPanelSpec } | null>(
    null,
  );
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useQuery({
    queryKey: ["plugins"],
    queryFn: async () => {
      const records = await apiGet<PluginRecord[]>("/api/plugins");
      for (const record of records) {
        useStore.getState().upsertPlugin(record);
      }
      return records;
    },
  });

  const remember = (name: string, message: string | null) =>
    setErrors((current) => ({ ...current, [name]: message }));

  const activate = async (plugin: PluginRecord) => {
    setBusy(plugin.name);
    try {
      const record = await apiSend<PluginRecord>(
        "POST",
        `/api/plugins/${encodeURIComponent(plugin.name)}/activate`,
      );
      useStore.getState().upsertPlugin(record);
      remember(plugin.name, null);
      const panel = panelFor(record);
      if (panel) {
        setViewer({ plugin: record, panel });
      }
    } catch (error) {
      remember(plugin.name, errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const deactivate = async (plugin: PluginRecord) => {
    setBusy(plugin.name);
    try {
      const record = await apiSend<PluginRecord>(
        "DELETE",
        `/api/plugins/${encodeURIComponent(plugin.name)}/activate`,
      );
      useStore.getState().upsertPlugin(record);
      remember(plugin.name, null);
      if (viewer?.plugin.name === plugin.name) {
        setViewer(null);
      }
    } catch (error) {
      remember(plugin.name, errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const records = Object.values(plugins);

  return (
    <section className="plugins-view" aria-label="Plugins">
      <h2>Plugins</h2>
      {records.length === 0 ? (
        <p>Sin plugins</p>
      ) : (
        <ul>
          {records.map((plugin) => {
            const manifest = plugin.manifest;
            const panel = panelFor(plugin);
            return (
              <li key={plugin.name} className="plugin-row">
                <div>
                  <strong>{plugin.name}</strong>{" "}
                  <span className="plugin-version">{manifest?.version}</span>
                  {manifest?.description && <p>{manifest.description}</p>}
                  <p className="plugin-state">Estado: {STATE_LABELS[plugin.state]}</p>
                  <p className="plugin-permissions">
                    Permisos: {manifest?.permissions.join(", ") || "ninguno"}
                  </p>
                  {plugin.error && <p className="plugin-error">{plugin.error}</p>}
                  {errors[plugin.name] && (
                    <p className="plugin-error">{errors[plugin.name]}</p>
                  )}
                </div>
                <div className="plugin-actions">
                  {plugin.state === "active" ? (
                    <>
                      {panel && (
                        <button
                          type="button"
                          onClick={() => setViewer({ plugin, panel })}
                        >
                          Abrir panel
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy === plugin.name}
                        onClick={() => deactivate(plugin)}
                      >
                        Desactivar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === plugin.name}
                      onClick={() => activate(plugin)}
                    >
                      Activar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {viewer && (
        <PluginPanel
          plugin={viewer.plugin}
          panel={viewer.panel}
          onClose={() => setViewer(null)}
        />
      )}
    </section>
  );
}
