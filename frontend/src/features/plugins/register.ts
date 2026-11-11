import { registerPanel } from "../../layout/panelRegistry";
import { PluginsView } from "./PluginsView";

export function registerPluginsPanel(): void {
  registerPanel({ id: "plugins", title: "Plugins", component: PluginsView });
}

registerPluginsPanel();
