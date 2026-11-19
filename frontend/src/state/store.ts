import { create } from "zustand";

import type { EnvironmentInfo, GraphSnapshot, PluginRecord, ServerEvent } from "../api/types";
import type { ConnectionStatus } from "../api/ws";

export interface StoreState {
  env: EnvironmentInfo | null;
  graph: GraphSnapshot | null;
  plugins: Record<string, PluginRecord>;
  rosConnected: boolean;
  connection: ConnectionStatus;
  setEnv: (env: EnvironmentInfo) => void;
  setGraph: (graph: GraphSnapshot) => void;
  setRosConnected: (connected: boolean) => void;
  setConnection: (connection: ConnectionStatus) => void;
  upsertPlugin: (plugin: PluginRecord) => void;
  applyServerEvent: (event: ServerEvent) => void;
}

export const useStore = create<StoreState>()((set) => ({
  env: null,
  graph: null,
  plugins: {},
  rosConnected: false,
  connection: "closed",
  setEnv: (env) => set({ env }),
  setGraph: (graph) => set({ graph }),
  setRosConnected: (rosConnected) => set({ rosConnected }),
  setConnection: (connection) => set({ connection }),
  upsertPlugin: (plugin) =>
    set((state) => ({ plugins: { ...state.plugins, [plugin.name]: plugin } })),
  applyServerEvent: (event) => {
    switch (event.type) {
      case "graph.update":
        set({ graph: event.data });
        break;
      case "ros.status":
        set({ rosConnected: event.data.connected });
        break;
      case "plugin.state":
        set((state) => ({
          plugins: { ...state.plugins, [event.data.name]: event.data },
        }));
        break;
      default:
        // Error events are shown by the feature that owns the failed action.
        break;
    }
  },
}));

export function addStoreSlice(slice: Partial<StoreState>): void {
  useStore.setState(slice);
}
