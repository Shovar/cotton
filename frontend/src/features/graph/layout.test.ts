import { describe, expect, it } from "vitest";

import type { GraphSnapshot } from "../../api/types";
import { GRAPH_HEIGHT, GRAPH_WIDTH, layoutGraph } from "./layout";

const SNAPSHOT: GraphSnapshot = {
  nodes: [
    {
      name: "/listener",
      namespace: "/",
      publishers: [],
      subscribers: ["/chatter"],
      services: [],
      actions: [],
    },
    {
      name: "/sim/controller",
      namespace: "/sim",
      publishers: ["/cmd_vel"],
      subscribers: [],
      services: [],
      actions: [],
    },
    {
      name: "/talker",
      namespace: "/",
      publishers: ["/chatter"],
      subscribers: [],
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
    {
      name: "/cmd_vel",
      types: ["geometry_msgs/msg/Twist"],
      publishers: ["/sim/controller"],
      subscribers: [],
    },
  ],
  services: {},
  actions: {},
  revision: 3,
};

function endpoints(layout: ReturnType<typeof layoutGraph>): string[] {
  return layout.links.map((link) => `${link.from.id}->${link.to.id}`);
}

describe("layoutGraph", () => {
  it("places every node and topic inside the canvas", () => {
    const layout = layoutGraph(SNAPSHOT);

    expect(layout.points.map((point) => point.id)).toEqual([
      "node:/listener",
      "node:/sim/controller",
      "node:/talker",
      "topic:/chatter",
      "topic:/cmd_vel",
    ]);
    for (const point of layout.points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(GRAPH_WIDTH);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(GRAPH_HEIGHT);
    }
  });

  it("links publishers into their topic and the topic into its subscribers", () => {
    expect(endpoints(layoutGraph(SNAPSHOT))).toEqual([
      "node:/talker->topic:/chatter",
      "topic:/chatter->node:/listener",
      "node:/sim/controller->topic:/cmd_vel",
    ]);
  });

  it("keeps the neighbours of a search match visible", () => {
    const byTopic = layoutGraph(SNAPSHOT, "chatter");
    expect(byTopic.points.map((point) => point.id)).toEqual([
      "node:/listener",
      "node:/talker",
      "topic:/chatter",
    ]);
    expect(endpoints(byTopic)).toHaveLength(2);

    const byNode = layoutGraph(SNAPSHOT, "sim");
    expect(byNode.points.map((point) => point.id)).toEqual([
      "node:/sim/controller",
      "topic:/cmd_vel",
    ]);
  });

  it("is deterministic and lays out a lone point at the centre", () => {
    expect(layoutGraph(SNAPSHOT).points).toEqual(layoutGraph(SNAPSHOT).points);

    const single = layoutGraph({
      nodes: [
        {
          name: "/solo",
          namespace: "/",
          publishers: [],
          subscribers: [],
          services: [],
          actions: [],
        },
      ],
      topics: [],
      services: {},
      actions: {},
      revision: 1,
    });

    expect(single.points).toHaveLength(1);
    expect(single.points[0].x).toBeCloseTo(GRAPH_WIDTH / 2, 5);
    expect(single.points[0].y).toBeCloseTo(GRAPH_HEIGHT / 2, 5);
  });

  it("returns an empty layout when nothing matches", () => {
    expect(layoutGraph(SNAPSHOT, "zzz")).toEqual({ points: [], links: [] });
  });
});
