import type { FunctionComponent } from "react";
import type { IDockviewPanelProps } from "dockview-react";

export interface PanelDefinition {
  id: string;
  title: string;
  component: FunctionComponent<IDockviewPanelProps>;
}

const panels = new Map<string, PanelDefinition>();

/** UX order of the known panels; unlisted panels keep their registration order. */
const PANEL_ORDER = ["graph", "terminals", "plugins"];

export function registerPanel(panel: PanelDefinition): void {
  panels.set(panel.id, panel);
}

export function getPanels(): PanelDefinition[] {
  const rank = (panel: PanelDefinition) => {
    const index = PANEL_ORDER.indexOf(panel.id);
    return index === -1 ? PANEL_ORDER.length : index;
  };
  return [...panels.values()].sort((left, right) => rank(left) - rank(right));
}

export function getPanel(id: string): PanelDefinition | undefined {
  return panels.get(id);
}

export function clearPanels(): void {
  panels.clear();
}
