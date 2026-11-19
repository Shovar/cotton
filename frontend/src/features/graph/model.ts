import type { GraphSnapshot } from "../../api/types";

/** Topics that connect to almost everything and turn the graph into a hairball. */
export const QUIET_TOPICS: readonly string[] = [
  "/clock",
  "/parameter_events",
  "/rosout",
  "/rosout_agg",
  "/tf",
  "/tf_static",
];

export type GraphKind = "node" | "topic" | "service" | "action";

export interface GraphNode {
  id: string;
  label: string;
  kind: GraphKind;
  namespace: string;
  degree: number;
  radius: number;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
}

export interface GraphSelection {
  kind: "node" | "topic";
  name: string;
}

export interface GraphModel {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface GraphOptions {
  search?: string;
}

interface Entity {
  id: string;
  label: string;
  kind: GraphKind;
  namespace: string;
}

/**
 * Turns a ROS graph snapshot into everything the canvas needs: typed entities,
 * data-flow links and one-hop search.
 */
export function buildGraph(snapshot: GraphSnapshot, options: GraphOptions = {}): GraphModel {
  const { search = "" } = options;

  const entities = new Map<string, Entity>();
  const edges = new Map<string, GraphLink>();

  for (const node of snapshot.nodes) {
    entities.set(nodeId(node.name), {
      id: nodeId(node.name),
      label: node.name,
      kind: "node",
      namespace: node.namespace || namespaceOf(node.name),
    });
  }
  for (const topic of snapshot.topics) {
    if (QUIET_TOPICS.includes(topic.name)) continue;
    entities.set(topicId(topic.name), {
      id: topicId(topic.name),
      label: topic.name,
      kind: "topic",
      namespace: namespaceOf(topic.name),
    });
  }
  for (const name of Object.keys(snapshot.services)) {
    entities.set(serviceId(name), {
      id: serviceId(name),
      label: name,
      kind: "service",
      namespace: namespaceOf(name),
    });
  }
  for (const name of Object.keys(snapshot.actions)) {
    entities.set(actionId(name), {
      id: actionId(name),
      label: name,
      kind: "action",
      namespace: namespaceOf(name),
    });
  }

  for (const topic of snapshot.topics) {
    for (const publisher of topic.publishers) {
      addLink(edges, nodeId(publisher), topicId(topic.name));
    }
    for (const subscriber of topic.subscribers) {
      addLink(edges, topicId(topic.name), nodeId(subscriber));
    }
  }
  for (const node of snapshot.nodes) {
    for (const service of node.services) {
      if (snapshot.services[service]) {
        addLink(edges, nodeId(node.name), serviceId(service));
      }
    }
    for (const action of node.actions) {
      if (snapshot.actions[action]) {
        addLink(edges, nodeId(node.name), actionId(action));
      }
    }
  }

  let kept = new Set(entities.keys());

  const linkedEdges = () =>
    [...edges.values()].filter((edge) => kept.has(edge.source) && kept.has(edge.target));

  const needle = search.trim().toLowerCase();
  if (needle) {
    const matched = new Set(
      [...kept].filter((id) => entities.get(id)?.label.toLowerCase().includes(needle)),
    );
    const neighbours = adjacency(linkedEdges());
    const keep = new Set(matched);
    for (const id of matched) {
      for (const neighbour of neighbours.get(id) ?? []) {
        keep.add(neighbour);
      }
    }
    kept = keep;
  }

  const links: GraphLink[] = [];
  const seen = new Set<string>();
  for (const edge of linkedEdges()) {
    const key = [edge.source, edge.target].sort().join("~");
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(edge);
  }

  const degree = new Map<string, number>();
  for (const link of links) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }

  const nodes: GraphNode[] = [];
  for (const id of kept) {
    const entity = entities.get(id);
    if (!entity) continue;
    const node: GraphNode = {
      id,
      label: entity.label,
      kind: entity.kind,
      namespace: entity.namespace,
      degree: degree.get(id) ?? 0,
      radius: 0,
    };
    node.radius = radiusOf(node);
    nodes.push(node);
  }

  return { nodes, links };
}

export function radiusOf(node: Pick<GraphNode, "kind" | "degree">): number {
  const spread = Math.sqrt(Math.max(node.degree, 0));
  switch (node.kind) {
    case "node":
      return 5.5 + Math.min(4, spread * 1.3);
    case "topic":
      return 3.5 + Math.min(3.5, spread * 1.2);
    case "service":
    case "action":
      return 4;
  }
}

export function isSelectable(node: GraphNode): boolean {
  return node.kind === "node" || node.kind === "topic";
}

function addLink(edges: Map<string, GraphLink>, source: string, target: string): void {
  if (source === target) return;
  const key = [source, target].sort().join("~");
  if (edges.has(key)) return;
  edges.set(key, { id: `${source}->${target}`, source, target });
}

function adjacency(edges: readonly GraphLink[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const connect = (from: string, to: string) => {
    const current = map.get(from) ?? new Set<string>();
    current.add(to);
    map.set(from, current);
  };
  for (const edge of edges) {
    connect(edge.source, edge.target);
    connect(edge.target, edge.source);
  }
  return map;
}

function namespaceOf(name: string): string {
  const index = name.lastIndexOf("/");
  return index <= 0 ? "/" : name.slice(0, index);
}

function nodeId(name: string): string {
  return `node:${name}`;
}

function topicId(name: string): string {
  return `topic:${name}`;
}

function serviceId(name: string): string {
  return `service:${name}`;
}

function actionId(name: string): string {
  return `action:${name}`;
}
