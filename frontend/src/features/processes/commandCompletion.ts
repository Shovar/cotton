import type { GraphSnapshot } from "../../api/types";

export type SuggestionKind = "command" | "ros" | "node" | "topic" | "service" | "action";

export interface Suggestion {
  value: string;
  kind: SuggestionKind;
}

export interface CompletionSources {
  commands: string[];
  graph: GraphSnapshot | null;
}

type EntityKind = "node" | "topic" | "service" | "action";

const LIMIT = 50;

const ROS_ENTRY_POINTS = ["colcon", "ros2", "rosdep", "rqt", "rviz2"];

const ROS_VERBS = [
  "action",
  "bag",
  "component",
  "daemon",
  "doctor",
  "interface",
  "launch",
  "lifecycle",
  "multicast",
  "node",
  "param",
  "pkg",
  "run",
  "security",
  "service",
  "topic",
];

const ROS_SUBCOMMANDS: Record<string, string[]> = {
  action: ["info", "list", "send_goal"],
  bag: ["info", "play", "record"],
  component: ["list", "load", "unload"],
  interface: ["list", "proto", "show"],
  lifecycle: ["get", "list", "set"],
  node: ["info", "list"],
  param: ["delete", "describe", "dump", "get", "list", "set"],
  pkg: ["executables", "list", "prefix", "xml"],
  service: ["call", "find", "info", "list", "type"],
  topic: ["bw", "delay", "echo", "find", "hz", "info", "list", "pub"],
};

const ROS_FIRST_ARGUMENT: Record<string, Record<string, EntityKind>> = {
  action: { info: "action", send_goal: "action" },
  lifecycle: { get: "node", set: "node" },
  node: { info: "node" },
  param: { delete: "node", describe: "node", dump: "node", get: "node", list: "node", set: "node" },
  service: { call: "service", find: "service", info: "service", type: "service" },
  topic: { bw: "topic", delay: "topic", echo: "topic", find: "topic", hz: "topic", info: "topic", pub: "topic" },
};

function split(input: string): { before: string; token: string; words: string[] } {
  const token = /(\S*)$/.exec(input)?.[1] ?? "";
  const before = input.slice(0, input.length - token.length);
  const words = before.trim() ? before.trim().split(/\s+/) : [];
  return { before, token, words };
}

function graphSuggestions(kind: EntityKind, graph: GraphSnapshot | null): Suggestion[] {
  if (!graph) {
    return [];
  }
  const values =
    kind === "node"
      ? graph.nodes.map((node) => node.name)
      : kind === "topic"
        ? graph.topics.map((topic) => topic.name)
        : kind === "service"
          ? Object.keys(graph.services)
          : Object.keys(graph.actions);
  return values.map((value) => ({ value, kind }));
}

function allGraphSuggestions(graph: GraphSnapshot | null): Suggestion[] {
  return [
    ...graphSuggestions("node", graph),
    ...graphSuggestions("topic", graph),
    ...graphSuggestions("service", graph),
    ...graphSuggestions("action", graph),
  ];
}

function contextEntity(words: string[]): EntityKind | null {
  if (words[0] !== "ros2" || words.length !== 3) {
    return null;
  }
  return ROS_FIRST_ARGUMENT[words[1]]?.[words[2]] ?? null;
}

function candidates(words: string[], token: string, sources: CompletionSources): Suggestion[] {
  if (token.startsWith("/")) {
    const entity = contextEntity(words);
    return entity ? graphSuggestions(entity, sources.graph) : allGraphSuggestions(sources.graph);
  }
  if (words.length === 0) {
    return [
      ...sources.commands.map((value): Suggestion => ({ value, kind: "command" })),
      ...ROS_ENTRY_POINTS.map((value): Suggestion => ({ value, kind: "ros" })),
    ];
  }
  if (words[0] !== "ros2") {
    return [];
  }
  if (words.length === 1) {
    return ROS_VERBS.map((value): Suggestion => ({ value, kind: "ros" }));
  }
  if (words.length === 2) {
    return (ROS_SUBCOMMANDS[words[1]] ?? []).map((value): Suggestion => ({ value, kind: "ros" }));
  }
  const entity = contextEntity(words);
  return entity ? graphSuggestions(entity, sources.graph) : [];
}

export function complete(input: string, sources: CompletionSources): Suggestion[] {
  const { token, words } = split(input);
  const needle = token.toLowerCase();
  const unique = new Map<string, Suggestion>();
  for (const suggestion of candidates(words, token, sources)) {
    if (!unique.has(suggestion.value)) {
      unique.set(suggestion.value, suggestion);
    }
  }
  const all = [...unique.values()];
  const starts = all.filter((suggestion) => suggestion.value.toLowerCase().startsWith(needle));
  const contains = all.filter(
    (suggestion) =>
      !suggestion.value.toLowerCase().startsWith(needle) &&
      suggestion.value.toLowerCase().includes(needle),
  );
  const byValue = (left: Suggestion, right: Suggestion) =>
    left.value.localeCompare(right.value);
  return [...starts.sort(byValue), ...contains.sort(byValue)].slice(0, LIMIT);
}

export function applySuggestion(input: string, value: string): string {
  return `${split(input).before}${value} `;
}
