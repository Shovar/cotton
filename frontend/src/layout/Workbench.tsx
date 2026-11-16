import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
} from "dockview-react";
import { Boxes, Puzzle, SquareTerminal, Waypoints, type LucideIcon } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import logoUrl from "../assets/ros-studio-logo.png";
import { loadPreferences, savePreferences } from "../state/preferences";
import { CommandPalette } from "./CommandPalette";
import { getPanel, getPanels, type PanelDefinition } from "./panelRegistry";

type LayoutState = ReturnType<DockviewApi["toJSON"]>;

const PANEL_ICONS: Record<string, LucideIcon> = {
  graph: Waypoints,
  processes: SquareTerminal,
  plugins: Puzzle,
};

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
    <div className="grid min-h-0 grid-cols-[3.5rem_1fr]">
      <nav
        aria-label="Sections"
        className="flex flex-col items-center gap-1 border-r border-border bg-card p-1.5"
      >
        <img
          src={logoUrl}
          alt="ROS Studio"
          className="mb-1 size-10 object-contain brightness-0 dark:invert"
        />
        <TooltipProvider delayDuration={300}>
          {panels.map((panel) => {
            const Icon = PANEL_ICONS[panel.id] ?? Boxes;
            return (
              <Tooltip key={panel.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={panel.title}
                    aria-pressed={activeId === panel.id}
                    onClick={() => openPanel(panel)}
                    className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent aria-pressed:text-primary"
                  >
                    <Icon aria-hidden="true" className="size-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{panel.title}</TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </nav>
      <div className="min-h-0 min-w-0 bg-background">
        <DockviewReact components={components} onReady={onReady} />
      </div>
      <CommandPalette onAction={runAction} />
    </div>
  );
}
