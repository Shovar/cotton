import { create } from "zustand";

import type {
  EnvironmentInfo,
  GraphSnapshot,
  PluginRecord,
  ProcessRecord,
  ServerEvent,
} from "../api/types";
import type { ConnectionStatus } from "../api/ws";

export interface StoreState {
  env: EnvironmentInfo | null;
  graph: GraphSnapshot | null;
  processes: Record<string, ProcessRecord>;
  plugins: Record<string, PluginRecord>;
  rosConnected: boolean;
  connection: ConnectionStatus;
  setEnv: (env: EnvironmentInfo) => void;
  setGraph: (graph: GraphSnapshot) => void;
  setRosConnected: (connected: boolean) => void;
  setConnection: (connection: ConnectionStatus) => void;
  upsertProcess: (process: ProcessRecord) => void;
  upsertPlugin: (plugin: PluginRecord) => void;
  applyServerEvent: (event: ServerEvent) => void;
}

export const useStore = create<StoreState>()((set) => ({
  env: null,
  graph: null,
  processes: {},
  plugins: {},
  rosConnected: false,
  connection: "closed",
  setEnv: (env) => set({ env }),
  setGraph: (graph) => set({ graph }),
  setRosConnected: (rosConnected) => set({ rosConnected }),
  setConnection: (connection) => set({ connection }),
  upsertProcess: (process) =>
    set((state) => ({ processes: { ...state.processes, [process.id]: process } })),
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
      case "process.state":
        set((state) => ({
          processes: { ...state.processes, [event.data.id]: event.data },
        }));
        break;
      case "plugin.state":
        set((state) => ({
          plugins: { ...state.plugins, [event.data.name]: event.data },
        }));
        break;
      default:
        // Log and error events belong to feature slices registered with addStoreSlice().
        break;
    }
  },
}));

export function addStoreSlice(slice: Partial<StoreState>): void {
  useStore.setState(slice);
}
