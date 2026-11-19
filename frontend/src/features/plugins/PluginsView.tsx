import { useQuery } from "@tanstack/react-query";
import { Puzzle } from "lucide-react";
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

const STATE_DOTS: Record<PluginState, string> = {
  discovered: "bg-muted-foreground/50",
  active: "bg-success",
  stopped: "bg-muted-foreground",
  error: "bg-destructive",
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
    <section aria-label="Plugins" className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-1.5">
        <Puzzle aria-hidden="true" className="size-4 text-muted-foreground" />
        <h2 className="text-xs font-semibold">Plugins</h2>
        <span className="rounded-full bg-muted px-1.5 text-[11px] leading-4 text-muted-foreground">
          {records.length}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {records.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center">
            <Puzzle aria-hidden="true" className="size-6 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">No plugins</p>
          </div>
        ) : (
          <ul className="grid gap-2">
            {records.map((plugin) => {
              const manifest = plugin.manifest;
              const panel = panelFor(plugin);
              const permissions = manifest?.permissions ?? [];
              const failure = errors[plugin.name] ?? plugin.error;
              return (
                <li key={plugin.name} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`size-2 rounded-full ${STATE_DOTS[plugin.state]}`}
                          aria-hidden="true"
                        />
                        <strong className="font-mono text-sm">{plugin.name}</strong>
                        {manifest?.version && (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {manifest.version}
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          State: {STATE_LABELS[plugin.state]}
                        </span>
                      </div>
                      {manifest?.description && (
                        <p className="text-xs text-muted-foreground">{manifest.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[11px] text-muted-foreground">Permissions:</span>
                        {permissions.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground">none</span>
                        ) : (
                          permissions.map((permission) => (
                            <span
                              key={permission}
                              className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {permission}
                            </span>
                          ))
                        )}
                      </div>
                      {failure && (
                        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                          {failure}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
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
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
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
