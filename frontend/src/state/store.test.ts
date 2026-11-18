import { beforeEach, describe, expect, it } from "vitest";

import type { EnvironmentInfo, GraphSnapshot, PluginRecord } from "../api/types";
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

function pluginRecord(name: string): PluginRecord {
  return {
    name,
    state: "active",
    error: null,
    manifest: {
      name,
      version: "0.1.0",
      description: "",
      panels: [],
      permissions: [],
    },
  };
}

beforeEach(() => {
  useStore.setState({
    env: null,
    graph: null,
    plugins: {},
    rosConnected: false,
    connection: "closed",
  });
});

describe("store", () => {
  it("starts with the shell slices empty", () => {
    const state = useStore.getState();

    expect(state.env).toBeNull();
    expect(state.graph).toBeNull();
    expect(state.plugins).toEqual({});
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

    expect(useStore.getState()).toMatchObject({ plugins: {}, rosConnected: false });
  });

  it("exposes setters for the shell slices", () => {
    const state = useStore.getState();
    state.setEnv(ENV);
    state.setGraph(GRAPH);
    state.setRosConnected(true);
    state.setConnection("open");
    state.upsertPlugin(pluginRecord("viewer"));

    expect(useStore.getState()).toMatchObject({
      env: ENV,
      graph: GRAPH,
      rosConnected: true,
      connection: "open",
    });
    expect(useStore.getState().plugins.viewer.name).toBe("viewer");
  });

  it("merges an added slice without replacing shell state", () => {
    useStore.getState().setEnv(ENV);

    addStoreSlice({ rosConnected: true });

    expect(useStore.getState().env).toEqual(ENV);
    expect(useStore.getState().rosConnected).toBe(true);
  });
});
