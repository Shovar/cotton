import { describe, expect, it } from "vitest";

import type { GraphSnapshot } from "../../api/types";
import { applySuggestion, complete } from "./commandCompletion";

const graph: GraphSnapshot = {
  nodes: [
    {
      name: "/talker",
      namespace: "/",
      publishers: [],
      subscribers: [],
      services: [],
      actions: [],
    },
  ],
  topics: [{ name: "/chatter", types: ["std_msgs/msg/String"], publishers: [], subscribers: [] }],
  services: { "/set_bool": ["std_srvs/srv/SetBool"] },
  actions: { "/navigate": ["nav2_msgs/action/NavigateToPose"] },
  revision: 1,
};

const sources = { commands: ["ros2", "rosdep", "rviz2"], graph };

describe("complete", () => {
  it("completes commands by prefix, ignoring case", () => {
    expect(complete("ROS", sources).map((suggestion) => suggestion.value)).toEqual([
      "ros2",
      "rosdep",
    ]);
  });

  it("completes ros2 verbs", () => {
    expect(complete("ros2 t", sources).map((suggestion) => suggestion.value)).toContain("topic");
  });

  it("completes ros2 topic subcommands", () => {
    expect(complete("ros2 topic ", sources).map((suggestion) => suggestion.value)).toEqual(
      expect.arrayContaining(["echo", "list"]),
    );
  });

  it("completes topic names for ros2 topic echo", () => {
    expect(complete("ros2 topic echo /chat", sources)).toEqual([
      { value: "/chatter", kind: "topic" },
    ]);
  });

  it("completes node names for ros2 node info", () => {
    expect(complete("ros2 node info /tal", sources)).toEqual([
      { value: "/talker", kind: "node" },
    ]);
  });

  it("completes service and action names", () => {
    expect(complete("ros2 service call /set", sources)).toEqual([
      { value: "/set_bool", kind: "service" },
    ]);
    expect(complete("ros2 action send_goal /nav", sources)).toEqual([
      { value: "/navigate", kind: "action" },
    ]);
  });

  it("completes graph names for any slash-prefixed token", () => {
    expect(complete("echo /chat", sources)).toEqual([{ value: "/chatter", kind: "topic" }]);
  });

  it("does not offer names after the first argument", () => {
    expect(complete("ros2 param get /talker ", sources)).toEqual([]);
  });

  it("deduplicates values", () => {
    const values = complete("ros", sources).map((suggestion) => suggestion.value);
    expect(values.filter((value) => value === "ros2")).toHaveLength(1);
  });

  it("returns nothing for commands it cannot assist", () => {
    expect(complete("sleep 5", sources)).toEqual([]);
    expect(complete("ros2 topic echo /", { commands: [], graph: null })).toEqual([]);
  });

  it("limits the list", () => {
    const topics = Array.from({ length: 60 }, (_, index) => ({
      name: `/topic_${index}`,
      types: [],
      publishers: [],
      subscribers: [],
    }));
    const many: GraphSnapshot = { ...graph, topics };

    expect(complete("ros2 topic echo /topic_", { commands: [], graph: many })).toHaveLength(50);
  });
});

describe("applySuggestion", () => {
  it("replaces the current token and leaves a trailing space", () => {
    expect(applySuggestion("ros2 topic echo /chat", "/chatter")).toBe(
      "ros2 topic echo /chatter ",
    );
    expect(applySuggestion("ro", "ros2")).toBe("ros2 ");
    expect(applySuggestion("ros2 topic ", "echo")).toBe("ros2 topic echo ");
  });
});
