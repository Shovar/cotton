import { useEffect, useState } from "react";

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
    <div className="plugin-panel" role="dialog" aria-modal="true" aria-label={title}>
      <header className="plugin-panel-header">
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close panel">
          Close
        </button>
      </header>
      {!embeddable ? (
        <p>This panel type cannot be embedded.</p>
      ) : !available ? (
        <p>
          The viewer assets are not available. Check the connection and restart ROS Studio, or
          copy <code>lichtblick-web.tar.gz</code> into the local cache before starting.
        </p>
      ) : (
        <iframe title={title} src={src} />
      )}
    </div>
  );
}
