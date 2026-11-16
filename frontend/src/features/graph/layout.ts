import type { GraphSnapshot } from "../../api/types";

export const GRAPH_WIDTH = 960;
export const GRAPH_HEIGHT = 600;

const PADDING = 64;
const ITERATIONS = 180;
const COOLING = 0.97;

export interface GraphPoint {
  id: string;
  kind: "node" | "topic";
  label: string;
  x: number;
  y: number;
}

export interface GraphLink {
  id: string;
  from: GraphPoint;
  to: GraphPoint;
}

export interface GraphLayout {
  points: GraphPoint[];
  links: GraphLink[];
}

/**
 * Lays nodes and topics over a fixed canvas with a small force simulation, so
 * each one-hop neighbourhood ends up close together. Links always point in the
 * direction the data travels: publisher → topic → subscriber.
 */
export function layoutGraph(snapshot: GraphSnapshot, search = ""): GraphLayout {
  const needle = search.trim().toLowerCase();
  const matches = (name: string) => name.toLowerCase().includes(needle);

  const matchedNodes = snapshot.nodes.filter((node) => matches(node.name));
  const matchedTopics = snapshot.topics.filter((topic) => matches(topic.name));

  // Keep one hop around a match so the search never hides how things connect.
  const visibleNodes = new Set(matchedNodes.map((node) => node.name));
  const visibleTopics = new Set(matchedTopics.map((topic) => topic.name));
  for (const topic of matchedTopics) {
    for (const name of [...topic.publishers, ...topic.subscribers]) visibleNodes.add(name);
  }
  for (const node of matchedNodes) {
    for (const name of [...node.publishers, ...node.subscribers]) visibleTopics.add(name);
  }

  const points: GraphPoint[] = [];
  const byId = new Map<string, GraphPoint>();
  for (const node of snapshot.nodes) {
    if (visibleNodes.has(node.name)) {
      addPoint({ id: `node:${node.name}`, kind: "node", label: node.name });
    }
  }
  for (const topic of snapshot.topics) {
    if (visibleTopics.has(topic.name)) {
      addPoint({ id: `topic:${topic.name}`, kind: "topic", label: topic.name });
    }
  }

  const links: GraphLink[] = [];
  const seen = new Set<string>();
  for (const topic of snapshot.topics) {
    const topicPoint = byId.get(`topic:${topic.name}`);
    if (!topicPoint) continue;
    for (const name of topic.publishers) {
      addLink(byId.get(`node:${name}`), topicPoint);
    }
    for (const name of topic.subscribers) {
      addLink(topicPoint, byId.get(`node:${name}`));
    }
  }

  const positions = place(
    points.length,
    links.map((link) => [
      points.indexOf(link.from),
      points.indexOf(link.to),
    ] as [number, number]),
  );
  points.forEach((point, index) => {
    point.x = positions[index].x;
    point.y = positions[index].y;
  });

  return { points, links };

  function addPoint(point: Omit<GraphPoint, "x" | "y">): void {
    const placed = { ...point, x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 };
    points.push(placed);
    byId.set(point.id, placed);
  }

  function addLink(from: GraphPoint | undefined, to: GraphPoint | undefined): void {
    if (!from || !to) return;
    const id = `${from.id}->${to.id}`;
    if (seen.has(id)) return;
    seen.add(id);
    links.push({ id, from, to });
  }
}

function place(count: number, links: Array<[number, number]>): Array<{ x: number; y: number }> {
  const cx = GRAPH_WIDTH / 2;
  const cy = GRAPH_HEIGHT / 2;
  const radius = Math.min(GRAPH_WIDTH, GRAPH_HEIGHT) / 2 - PADDING;
  const points = Array.from({ length: count }, (_, index) =>
    count < 2
      ? { x: cx, y: cy }
      : {
          x: cx + radius * Math.cos((2 * Math.PI * index) / count),
          y: cy + radius * Math.sin((2 * Math.PI * index) / count),
        },
  );
  if (count < 2) return points;

  const area = (GRAPH_WIDTH - PADDING * 2) * (GRAPH_HEIGHT - PADDING * 2);
  const spacing = Math.sqrt(area / count);
  let temperature = radius / 4;

  for (let step = 0; step < ITERATIONS; step += 1) {
    const shift = points.map(() => ({ x: 0, y: 0 }));

    for (let a = 0; a < count; a += 1) {
      for (let b = a + 1; b < count; b += 1) {
        const dx = points[a].x - points[b].x;
        const dy = points[a].y - points[b].y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const force = (spacing * spacing) / distance;
        shift[a].x += (dx / distance) * force;
        shift[a].y += (dy / distance) * force;
        shift[b].x -= (dx / distance) * force;
        shift[b].y -= (dy / distance) * force;
      }
    }

    for (const [a, b] of links) {
      const dx = points[a].x - points[b].x;
      const dy = points[a].y - points[b].y;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const force = (distance * distance) / spacing;
      shift[a].x -= (dx / distance) * force;
      shift[a].y -= (dy / distance) * force;
      shift[b].x += (dx / distance) * force;
      shift[b].y += (dy / distance) * force;
    }

    points.forEach((point, index) => {
      shift[index].x += (cx - point.x) * 0.05;
      shift[index].y += (cy - point.y) * 0.05;
      const magnitude = Math.max(Math.hypot(shift[index].x, shift[index].y), 1);
      const stride = Math.min(magnitude, temperature);
      point.x = clamp(point.x + (shift[index].x / magnitude) * stride, PADDING, GRAPH_WIDTH - PADDING);
      point.y = clamp(point.y + (shift[index].y / magnitude) * stride, PADDING, GRAPH_HEIGHT - PADDING);
    });
    temperature *= COOLING;
  }
  return points;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
