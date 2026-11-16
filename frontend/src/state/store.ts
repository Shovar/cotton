import { create } from "zustand";

import type {
  EnvironmentInfo,
  GraphSnapshot,
  LogLine,
  PluginRecord,
  ProcessRecord,
  ServerEvent,
} from "../api/types";
import type { ConnectionStatus } from "../api/ws";

const LOG_LIMIT = 2000;

function appendToLogs(state: StoreState, line: LogLine): Partial<StoreState> {
  const lines = [...(state.logs[line.id] ?? []), line].slice(-LOG_LIMIT);
  return { logs: { ...state.logs, [line.id]: lines } };
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

export interface StoreState {
  env: EnvironmentInfo | null;
  graph: GraphSnapshot | null;
  processes: Record<string, ProcessRecord>;
  plugins: Record<string, PluginRecord>;
  logs: Record<string, LogLine[]>;
  rosConnected: boolean;
  connection: ConnectionStatus;
  setEnv: (env: EnvironmentInfo) => void;
  setGraph: (graph: GraphSnapshot) => void;
  setRosConnected: (connected: boolean) => void;
  setConnection: (connection: ConnectionStatus) => void;
  upsertProcess: (process: ProcessRecord) => void;
  upsertPlugin: (plugin: PluginRecord) => void;
  clearLogs: (processId: string) => void;
  removeProcess: (processId: string) => void;
  applyServerEvent: (event: ServerEvent) => void;
}

export const useStore = create<StoreState>()((set) => ({
  env: null,
  graph: null,
  processes: {},
  plugins: {},
  logs: {},
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
  clearLogs: (processId) => set((state) => ({ logs: without(state.logs, processId) })),
  removeProcess: (processId) =>
    set((state) => ({
      processes: without(state.processes, processId),
      logs: without(state.logs, processId),
    })),
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
      case "process.removed":
        set((state) => ({
          processes: without(state.processes, event.data.id),
          logs: without(state.logs, event.data.id),
        }));
        break;
      case "process.log":
        set((state) => appendToLogs(state, event.data));
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
