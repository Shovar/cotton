import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
} from "dockview-react";

import { loadPreferences, savePreferences } from "../state/preferences";
import { CommandPalette } from "./CommandPalette";
import { getPanel, getPanels, type PanelDefinition } from "./panelRegistry";

type LayoutState = ReturnType<DockviewApi["toJSON"]>;

function buildDefaultLayout(api: DockviewApi, panels: PanelDefinition[]): void {
  panels.forEach((panel, index) => {
    api.addPanel({
      id: panel.id,
      component: panel.id,
      title: panel.title,
      inactive: index > 0,
    });
  });
  api.getPanel(panels[0]?.id ?? "")?.api.setActive();
}

function persistLayout(api: DockviewApi): void {
  savePreferences({ ...loadPreferences(), layout: api.toJSON() });
}

export function Workbench() {
  const panels = useMemo(() => getPanels(), []);
  const components = useMemo(
    () => Object.fromEntries(panels.map((panel) => [panel.id, panel.component])),
    [panels],
  );
  const [api, setApi] = useState<DockviewApi | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const layout = loadPreferences().layout;
      if (layout) {
        try {
          event.api.fromJSON(layout as LayoutState);
        } catch {
          buildDefaultLayout(event.api, panels);
        }
      } else {
        buildDefaultLayout(event.api, panels);
      }
      setActiveId(event.api.activePanel?.id ?? panels[0]?.id ?? null);
      setApi(event.api);
    },
    [panels],
  );

  useEffect(() => {
    if (!api) {
      return;
    }
    const layoutSubscription = api.onDidLayoutChange(() => persistLayout(api));
    const activeSubscription = api.onDidActivePanelChange((event) =>
      setActiveId(event.panel?.id ?? null),
    );
    return () => {
      layoutSubscription.dispose();
      activeSubscription.dispose();
    };
  }, [api]);

  const openPanel = (panel: PanelDefinition) => {
    if (!api) {
      return;
    }
    const existing = api.getPanel(panel.id);
    if (existing) {
      existing.api.setActive();
      return;
    }
    api.addPanel({ id: panel.id, component: panel.id, title: panel.title });
  };

  const runAction = (action: string) => {
    const panel = getPanel(action.replace(/^open-/, ""));
    if (panel) {
      openPanel(panel);
    }
  };

  return (
    <div className="workbench">
      <nav className="activity-bar" aria-label="Secciones">
        {panels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            aria-label={panel.title}
            aria-pressed={activeId === panel.id}
            onClick={() => openPanel(panel)}
          >
            {panel.title}
          </button>
        ))}
      </nav>
      <div className="dock-host">
        <DockviewReact components={components} onReady={onReady} />
      </div>
      <CommandPalette onAction={runAction} />
    </div>
  );
}
