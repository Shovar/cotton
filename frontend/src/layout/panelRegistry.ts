import type { FunctionComponent } from "react";
import type { IDockviewPanelProps } from "dockview-react";

export interface PanelDefinition {
  id: string;
  title: string;
  component: FunctionComponent<IDockviewPanelProps>;
}

const panels = new Map<string, PanelDefinition>();

export function registerPanel(panel: PanelDefinition): void {
  panels.set(panel.id, panel);
}

export function getPanels(): PanelDefinition[] {
  return [...panels.values()];
}

export function getPanel(id: string): PanelDefinition | undefined {
  return panels.get(id);
}

export function clearPanels(): void {
  panels.clear();
}
