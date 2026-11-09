import { PlaceholderPanel } from "./PlaceholderPanel";
import { registerPanel } from "./panelRegistry";

const SHELL_PANELS = [
  { id: "graph", title: "Grafo" },
  { id: "processes", title: "Procesos" },
  { id: "plugins", title: "Plugins" },
  { id: "settings", title: "Ajustes" },
] as const;

export function registerShellPanels(): void {
  for (const panel of SHELL_PANELS) {
    registerPanel({ ...panel, component: PlaceholderPanel });
  }
}

registerShellPanels();
