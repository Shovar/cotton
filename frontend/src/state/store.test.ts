import { beforeEach, describe, expect, it } from "vitest";

import type {
  EnvironmentInfo,
  GraphSnapshot,
  LogLine,
  PluginRecord,
  ProcessRecord,
} from "../api/types";
import { addStoreSlice, useStore } from "./store";

const ENV: EnvironmentInfo = {
  distro: "jazzy",
  domain_id: 0,
  rmw: null,
  workspace: "/ws",
  ros_version: "2",
  app_version: "0.1.0",
};

const GRAPH: GraphSnapshot = {
  nodes: [],
  topics: [],
  services: {},
  actions: {},
  revision: 1,
};

function processRecord(id: string): ProcessRecord {
  return {
    id,
    spec: { id, argv: ["sleep", "1"], cwd: null, env: {}, plugin: null, autostart: false },
    state: "running",
    pid: 1,
    pgid: 1,
    started_at: null,
    exit_code: null,
    error: null,
    recovered: false,
  };
}

function logLine(text: string): LogLine {
  return { id: "p1", stream: "stdout", level: null, ts: "2026-11-06T12:00:00Z", text };
}

function pluginRecord(name: string): PluginRecord {
  return {
    name,
    state: "active",
    error: null,
    manifest: {
      name,
      version: "0.1.0",
      description: "",
      processes: [],
      panels: [],
      permissions: [],
    },
  };
}

beforeEach(() => {
  useStore.setState({
    env: null,
    graph: null,
    processes: {},
    plugins: {},
    logs: {},
    rosConnected: false,
    connection: "closed",
  });
});

describe("store", () => {
  it("starts with the shell slices empty", () => {
    const state = useStore.getState();

    expect(state.env).toBeNull();
    expect(state.graph).toBeNull();
    expect(state.processes).toEqual({});
    expect(state.plugins).toEqual({});
    expect(state.logs).toEqual({});
    expect(state.rosConnected).toBe(false);
    expect(state.connection).toBe("closed");
  });

  it("applies graph updates", () => {
    useStore.getState().applyServerEvent({ type: "graph.update", data: GRAPH });

    expect(useStore.getState().graph).toEqual(GRAPH);
  });

  it("applies ros status updates", () => {
    useStore.getState().applyServerEvent({
      type: "ros.status",
      data: { connected: true, error: null },
    });

    expect(useStore.getState().rosConnected).toBe(true);
  });

  it("upserts process state by id", () => {
    useStore.getState().applyServerEvent({
      type: "process.state",
      data: processRecord("p1"),
    });
    useStore.getState().applyServerEvent({
      type: "process.state",
      data: { ...processRecord("p1"), state: "failed", exit_code: 2 },
    });

    const processes = useStore.getState().processes;
    expect(Object.keys(processes)).toEqual(["p1"]);
    expect(processes.p1.state).toBe("failed");
    expect(processes.p1.exit_code).toBe(2);
  });

  it("upserts plugin state by name", () => {
    useStore.getState().applyServerEvent({
      type: "plugin.state",
      data: pluginRecord("foxglove"),
    });

    expect(useStore.getState().plugins.foxglove.state).toBe("active");
  });

  it("ignores events owned by feature slices", () => {
    useStore.getState().applyServerEvent({
      type: "error",
      data: { code: "unknown_channel", message: "nope" },
    });

    expect(useStore.getState().logs).toEqual({});
  });

  it("clears the logs of one terminal only", () => {
    useStore.setState({ logs: { p1: [logLine("old")], p2: [logLine("keep")] } });

    useStore.getState().clearLogs("p1");

    expect(useStore.getState().logs).toEqual({ p2: [logLine("keep")] });
  });

  it("removes a process together with its logs", () => {
    useStore.setState({
      processes: { p1: processRecord("p1"), p2: processRecord("p2") },
      logs: { p1: [logLine("old")] },
    });

    useStore.getState().removeProcess("p1");

    expect(Object.keys(useStore.getState().processes)).toEqual(["p2"]);
    expect(useStore.getState().logs).toEqual({});
  });

  it("applies a process removal from the server", () => {
    useStore.setState({
      processes: { p1: processRecord("p1") },
      logs: { p1: [logLine("old")] },
    });

    useStore.getState().applyServerEvent({ type: "process.removed", data: { id: "p1" } });

    expect(useStore.getState().processes).toEqual({});
    expect(useStore.getState().logs).toEqual({});
  });

  it("appends process logs and caps the buffer at 2000 lines", () => {
    for (let index = 0; index < 2005; index += 1) {
      useStore.getState().applyServerEvent({ type: "process.log", data: logLine(`line ${index}`) });
    }

    const logs = useStore.getState().logs.p1;
    expect(logs).toHaveLength(2000);
    expect(logs[0].text).toBe("line 5");
    expect(logs[1999].text).toBe("line 2004");
  });

  it("exposes setters for the shell slices", () => {
    const state = useStore.getState();
    state.setEnv(ENV);
    state.setGraph(GRAPH);
    state.setRosConnected(true);
    state.setConnection("open");
    state.upsertProcess(processRecord("p2"));
    state.upsertPlugin(pluginRecord("viewer"));

    expect(useStore.getState()).toMatchObject({
      env: ENV,
      graph: GRAPH,
      rosConnected: true,
      connection: "open",
    });
    expect(useStore.getState().processes.p2.id).toBe("p2");
    expect(useStore.getState().plugins.viewer.name).toBe("viewer");
  });

  it("merges an added slice without replacing shell state", () => {
    useStore.getState().setEnv(ENV);

    addStoreSlice({ rosConnected: true });

    expect(useStore.getState().env).toEqual(ENV);
    expect(useStore.getState().rosConnected).toBe(true);
  });
});
