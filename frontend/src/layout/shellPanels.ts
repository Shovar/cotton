import { PlaceholderPanel } from "./PlaceholderPanel";
import { registerPanel } from "./panelRegistry";

const SHELL_PANELS = [
  { id: "graph", title: "Graph" },
  { id: "processes", title: "Processes" },
  { id: "plugins", title: "Plugins" },
] as const;

export function registerShellPanels(): void {
  for (const panel of SHELL_PANELS) {
    registerPanel({ ...panel, component: PlaceholderPanel });
  }
}

registerShellPanels();
