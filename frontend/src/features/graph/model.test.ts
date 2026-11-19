import { describe, expect, it } from "vitest";

import type { GraphSnapshot } from "../../api/types";
import { buildGraph, radiusOf, type GraphOptions } from "./model";

const BASE: GraphSnapshot = {
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

function snapshot(overrides: Partial<GraphSnapshot> = {}): GraphSnapshot {
  return { ...BASE, ...overrides };
}

function ids(options: GraphOptions = {}): string[] {
  return buildGraph(BASE, options)
    .nodes.map((node) => node.id)
    .sort();
}

describe("buildGraph", () => {
  it("builds typed entities and data-flow links", () => {
    const model = buildGraph(BASE);

    expect(model.nodes.map((node) => node.id)).toEqual([
      "node:/talker",
      "node:/listener",
      "topic:/chatter",
    ]);
    expect(model.links.map((link) => `${link.source}->${link.target}`)).toEqual([
      "node:/talker->topic:/chatter",
      "topic:/chatter->node:/listener",
    ]);
  });

  it("never shows the noisy topics", () => {
    const noisy = snapshot({
      topics: [
        ...BASE.topics,
        { name: "/rosout", types: [], publishers: ["/talker"], subscribers: [] },
        { name: "/tf", types: [], publishers: [], subscribers: [] },
      ],
    });

    const model = buildGraph(noisy);

    expect(model.nodes.some((node) => node.id === "topic:/rosout")).toBe(false);
    expect(model.nodes.some((node) => node.id === "topic:/tf")).toBe(false);
    expect(model.links.some((link) => link.target === "topic:/rosout")).toBe(false);
  });

  it("keeps the neighbours of a search match", () => {
    expect(ids({ search: "talker" })).toEqual(["node:/talker", "topic:/chatter"]);

    const byTopic = buildGraph(BASE, { search: "chatter" });
    expect(byTopic.nodes.map((node) => node.label).sort()).toEqual([
      "/chatter",
      "/listener",
      "/talker",
    ]);
  });

  it("drops links that point at nodes missing from the snapshot", () => {
    const ghost = snapshot({
      nodes: [],
      topics: [{ name: "/ghost_topic", types: [], publishers: ["/ghost"], subscribers: [] }],
    });

    const model = buildGraph(ghost);
    expect(model.links).toEqual([]);
    expect(model.nodes.map((node) => node.id)).toEqual(["topic:/ghost_topic"]);
  });

  it("links services and actions to their owner as their own kinds", () => {
    const owner = snapshot({
      nodes: [
        {
          name: "/talker",
          namespace: "/",
          publishers: [],
          subscribers: [],
          services: ["/talker/get_parameters"],
          actions: ["/talker/fibonacci"],
        },
      ],
      topics: [],
      services: { "/talker/get_parameters": ["rcl_interfaces/srv/GetParameters"] },
      actions: { "/talker/fibonacci": ["action_tutorials_interfaces/action/Fibonacci"] },
    });

    const model = buildGraph(owner);
    expect(model.nodes.map((node) => node.kind).sort()).toEqual(["action", "node", "service"]);
    expect(model.links.map((link) => `${link.source}->${link.target}`).sort()).toEqual([
      "node:/talker->action:/talker/fibonacci",
      "node:/talker->service:/talker/get_parameters",
    ]);
  });

  it("gives hubs a larger radius than leaves", () => {
    expect(radiusOf({ kind: "node", degree: 8 })).toBeGreaterThan(
      radiusOf({ kind: "node", degree: 0 }),
    );
    expect(radiusOf({ kind: "topic", degree: 8 })).toBeGreaterThan(
      radiusOf({ kind: "topic", degree: 0 }),
    );
  });

  it("returns an explicit empty model", () => {
    const model = buildGraph({ nodes: [], topics: [], services: {}, actions: {}, revision: 0 });

    expect(model).toEqual({ nodes: [], links: [] });
  });
});
