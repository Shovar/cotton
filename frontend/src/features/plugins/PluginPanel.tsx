import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiExists } from "../../api/client";
import type { PluginPanelSpec, PluginRecord } from "../../api/types";

interface PluginPanelProps {
  plugin: PluginRecord;
  panel: PluginPanelSpec;
  onClose: () => void;
}

export function PluginPanel({ plugin, panel, onClose }: PluginPanelProps) {
  const src =
    panel.url
      ?.replaceAll("{hostname}", location.hostname)
      .replaceAll("{host}", location.host) ?? null;
  const embeddable = panel.type !== "native" && src !== null;
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    if (!src || panel.type === "native") {
      return;
    }
    const target = new URL(src, window.location.href);
    if (target.origin !== window.location.origin) {
      return;
    }
    let cancelled = false;
    void apiExists(target.pathname + target.search).then((exists) => {
      if (!cancelled) {
        setAvailable(exists);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [src, panel.type]);

  const title = panel.title || plugin.name;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 grid grid-rows-[auto_1fr] bg-card"
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-label="Close panel"
          onClick={onClose}
        >
          <X aria-hidden="true" />
          Close
        </Button>
      </header>
      {!embeddable ? (
        <p className="p-4 text-sm text-muted-foreground">
          This panel type cannot be embedded.
        </p>
      ) : !available ? (
        <p className="p-4 text-sm text-muted-foreground">
          The viewer assets are not available. Check the connection and restart ROS Studio, or
          copy <code className="rounded bg-muted px-1 py-0.5">lichtblick-web.tar.gz</code> into the
          local cache before starting.
        </p>
      ) : (
        <iframe title={title} src={src} className="size-full border-0" />
      )}
    </div>
  );
}
