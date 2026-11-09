import { registerPanel } from "../../layout/panelRegistry";
import { GraphPanel } from "./GraphPanel";

export function registerGraphPanel(): void {
  registerPanel({ id: "graph", title: "Grafo", component: GraphPanel });
}

registerGraphPanel();
