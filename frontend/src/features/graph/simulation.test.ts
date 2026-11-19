import { describe, expect, it } from "vitest";

import type { GraphSnapshot } from "../../api/types";
import { buildGraph } from "./model";
import {
  DEFAULT_SIMULATION,
  createSimulation,
  isSettled,
  pinNode,
  reheat,
  syncSimulation,
  tick,
  unpinNode,
  type SimulationParams,
} from "./simulation";

const SNAPSHOT: GraphSnapshot = {
  nodes: [
    {
      name: "/talker",
      namespace: "/",
      publishers: ["/chatter"],
      subscribers: [],
      services: [],
      actions: [],
    },
    {
      name: "/listener",
      namespace: "/",
      publishers: [],
      subscribers: ["/chatter"],
      services: [],
      actions: [],
    },
  ],
  topics: [
    {
      name: "/chatter",
      types: ["std_msgs/msg/String"],
      publishers: ["/talker"],
      subscribers: ["/listener"],
    },
  ],
  services: {},
  actions: {},
  revision: 1,
};

function newSimulation() {
  return createSimulation(buildGraph(SNAPSHOT));
}

function distance(simulation: ReturnType<typeof newSimulation>, a: string, b: string): number {
  const left = simulation.nodes.get(a);
  const right = simulation.nodes.get(b);
  if (!left || !right) throw new Error("missing node");
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function settle(simulation: ReturnType<typeof newSimulation>, params: SimulationParams, steps: number) {
  for (let step = 0; step < steps; step += 1) {
    simulation.alpha = 1;
    tick(simulation, params);
  }
}

describe("force simulation", () => {
  it("places every node and link of the model", () => {
    const simulation = newSimulation();

    expect(simulation.nodes.size).toBe(3);
    expect(simulation.links).toHaveLength(2);
    expect(simulation.alpha).toBeGreaterThan(0);
  });

  it("never moves a pinned node", () => {
    const simulation = newSimulation();
    pinNode(simulation, "node:/talker", 10, 20);

    for (let step = 0; step < 60; step += 1) {
      tick(simulation, DEFAULT_SIMULATION);
    }

    expect(simulation.nodes.get("node:/talker")).toMatchObject({
      x: 10,
      y: 20,
      pinned: true,
      vx: 0,
      vy: 0,
    });
  });

  it("releases a pinned node again", () => {
    const simulation = newSimulation();
    pinNode(simulation, "node:/talker", 10, 20);

    unpinNode(simulation, "node:/talker");

    expect(simulation.nodes.get("node:/talker")?.pinned).toBe(false);
  });

  it("pulls linked nodes further apart with a longer link distance", () => {
    const tight = newSimulation();
    const loose = newSimulation();
    const base: SimulationParams = {
      repulsion: 0,
      linkDistance: 40,
      linkStrength: 1,
      centerStrength: 0,
    };

    settle(tight, base, 300);
    settle(loose, { ...base, linkDistance: 220 }, 300);

    const tightDistance = distance(tight, "node:/talker", "topic:/chatter");
    const looseDistance = distance(loose, "node:/talker", "topic:/chatter");

    expect(tightDistance).toBeGreaterThan(0);
    expect(looseDistance).toBeGreaterThan(tightDistance * 1.5);
  });

  it("settles after a bounded number of steps", () => {
    const simulation = newSimulation();

    for (let step = 0; step < 400; step += 1) {
      tick(simulation, DEFAULT_SIMULATION);
    }

    expect(isSettled(simulation)).toBe(true);
  });

  it("keeps settled positions and adds new nodes next to a neighbour", () => {
    const simulation = newSimulation();
    for (let step = 0; step < 20; step += 1) {
      tick(simulation, DEFAULT_SIMULATION);
    }
    const settled = simulation.nodes.get("node:/talker");
    if (!settled) throw new Error("missing node");
    const position = { x: settled.x, y: settled.y };

    const extended = buildGraph({
      ...SNAPSHOT,
      nodes: [
        ...SNAPSHOT.nodes,
        {
          name: "/extra",
          namespace: "/",
          publishers: [],
          subscribers: ["/chatter"],
          services: [],
          actions: [],
        },
      ],
    });
    const changed = syncSimulation(simulation, extended);

    expect(changed).toBe(true);
    expect(simulation.nodes.get("node:/talker")).toMatchObject(position);
    expect(simulation.nodes.has("node:/extra")).toBe(true);
    expect(simulation.alpha).toBeGreaterThan(0.5);
  });

  it("drops nodes that left the model", () => {
    const simulation = newSimulation();
    const smaller = buildGraph({ ...SNAPSHOT, nodes: [SNAPSHOT.nodes[0]], topics: [] });

    const changed = syncSimulation(simulation, smaller);

    expect(changed).toBe(true);
    expect(simulation.nodes.has("node:/listener")).toBe(false);
    expect(simulation.nodes.has("topic:/chatter")).toBe(false);
  });

  it("settles when alpha drops and wakes up when reheated", () => {
    const simulation = newSimulation();
    simulation.alpha = 0.01;

    expect(isSettled(simulation)).toBe(true);
    reheat(simulation, 0.4);
    expect(isSettled(simulation)).toBe(false);
  });

  it("reheats without lowering an already hot simulation", () => {
    const simulation = newSimulation();
    simulation.alpha = 0.9;

    reheat(simulation, 0.4);

    expect(simulation.alpha).toBe(0.9);
  });
});
