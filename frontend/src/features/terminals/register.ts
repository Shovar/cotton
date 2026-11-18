import { registerPanel } from "../../layout/panelRegistry";
import { TerminalWorkspace } from "./TerminalWorkspace";

export function registerTerminalPanel(): void {
  registerPanel({ id: "terminals", title: "Terminals", component: TerminalWorkspace });
}

registerTerminalPanel();
