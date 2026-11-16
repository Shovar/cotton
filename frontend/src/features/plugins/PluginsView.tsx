import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { apiGet, apiSend } from "../../api/client";
import type { PluginPanelSpec, PluginRecord, PluginState } from "../../api/types";
import { useStore } from "../../state/store";
import { PluginPanel } from "./PluginPanel";

const STATE_LABELS: Record<PluginState, string> = {
  discovered: "Discovered",
  active: "Active",
  stopped: "Stopped",
  error: "Error",
};

function panelFor(plugin: PluginRecord): PluginPanelSpec | undefined {
  return plugin.manifest?.panels.find((panel) => panel.type !== "native" && panel.url);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not complete the action";
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
    <section aria-label="Plugins" className="h-full overflow-auto p-4">
      <h2 className="mb-3 text-sm font-semibold">Plugins</h2>
      {records.length === 0 ? (
        <p className="text-sm text-muted-foreground">No plugins</p>
      ) : (
        <ul className="grid gap-2">
          {records.map((plugin) => {
            const manifest = plugin.manifest;
            const panel = panelFor(plugin);
            return (
              <li
                key={plugin.name}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-baseline gap-2">
                    <strong className="text-sm">{plugin.name}</strong>
                    <span className="text-xs text-muted-foreground">{manifest?.version}</span>
                  </div>
                  {manifest?.description && (
                    <p className="text-xs text-muted-foreground">{manifest.description}</p>
                  )}
                  <p
                    className={
                      plugin.state === "error"
                        ? "text-xs text-destructive"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    State: {STATE_LABELS[plugin.state]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Permissions: {manifest?.permissions.join(", ") || "none"}
                  </p>
                  {plugin.error && <p className="text-xs text-destructive">{plugin.error}</p>}
                  {errors[plugin.name] && (
                    <p className="text-xs text-destructive">{errors[plugin.name]}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-start gap-1.5">
                  {plugin.state === "active" ? (
                    <>
                      {panel && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setViewer({ plugin, panel })}
                        >
                          Open panel
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === plugin.name}
                        onClick={() => deactivate(plugin)}
                      >
                        Deactivate
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busy === plugin.name}
                      onClick={() => activate(plugin)}
                    >
                      Activate
                    </Button>
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
