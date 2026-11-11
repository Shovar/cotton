import { useEffect, useState } from "react";

import { apiExists } from "../../api/client";
import type { PluginPanelSpec, PluginRecord } from "../../api/types";

interface PluginPanelProps {
  plugin: PluginRecord;
  panel: PluginPanelSpec;
  onClose: () => void;
}

export function PluginPanel({ plugin, panel, onClose }: PluginPanelProps) {
  const src = panel.url?.replaceAll("{hostname}", location.hostname) ?? null;
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
        <button type="button" onClick={onClose} aria-label="Cerrar panel">
          Cerrar
        </button>
      </header>
      {!embeddable ? (
        <p>Este tipo de panel no se puede incrustar.</p>
      ) : !available ? (
        <p>
          Los assets del visor no están disponibles. Revisa la conexión y reinicia ROS Studio, o
          copia <code>lichtblick-web.tar.gz</code> en la caché local antes de arrancar.
        </p>
      ) : (
        <iframe title={title} src={src} />
      )}
    </div>
  );
}
