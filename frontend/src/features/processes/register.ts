import { registerPanel } from "../../layout/panelRegistry";
import { ProcessesView } from "./ProcessesView";

export function registerProcessesPanel(): void {
  registerPanel({ id: "processes", title: "Procesos", component: ProcessesView });
}

registerProcessesPanel();
