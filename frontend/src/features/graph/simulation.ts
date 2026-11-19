import type { GraphModel } from "./model";

export interface SimulationParams {
  repulsion: number;
  linkDistance: number;
  linkStrength: number;
  centerStrength: number;
}

export const DEFAULT_SIMULATION: SimulationParams = {
  repulsion: 800,
  linkDistance: 90,
  linkStrength: 0.5,
  centerStrength: 0.03,
};

export const STOP_ALPHA = 0.02;

const DECAY = 0.985;
const DAMPING = 0.6;
const MAX_VELOCITY = 24;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
}

export interface SimLink {
  source: string;
  target: string;
}

export interface Simulation {
  nodes: Map<string, SimNode>;
  links: SimLink[];
  alpha: number;
}

export function createSimulation(model: GraphModel): Simulation {
  const nodes = new Map<string, SimNode>();
  model.nodes.forEach((node, index) => {
    const radius = 20 * Math.sqrt(index);
    nodes.set(node.id, {
      id: node.id,
      x: radius * Math.cos(index * GOLDEN_ANGLE),
      y: radius * Math.sin(index * GOLDEN_ANGLE),
      vx: 0,
      vy: 0,
      pinned: false,
    });
  });
  return { nodes, links: model.links.map(({ source, target }) => ({ source, target })), alpha: 0.8 };
}

/**
 * Applies an incremental model change: settled positions stay put, removed nodes
 * disappear, new nodes appear next to a neighbour, and the simulation reheats.
 */
export function syncSimulation(simulation: Simulation, model: GraphModel): boolean {
  let changed = false;
  const alive = new Set(model.nodes.map((node) => node.id));
  for (const id of [...simulation.nodes.keys()]) {
    if (!alive.has(id)) {
      simulation.nodes.delete(id);
      changed = true;
    }
  }

  const links = model.links.map(({ source, target }) => ({ source, target }));
  const neighbours = new Map<string, string[]>();
  for (const link of links) {
    neighbours.set(link.source, [...(neighbours.get(link.source) ?? []), link.target]);
    neighbours.set(link.target, [...(neighbours.get(link.target) ?? []), link.source]);
  }

  model.nodes.forEach((node, index) => {
    if (simulation.nodes.has(node.id)) return;
    const anchors = (neighbours.get(node.id) ?? [])
      .map((id) => simulation.nodes.get(id))
      .filter((anchor): anchor is SimNode => anchor !== undefined);
    const anchor = anchors.reduce(
      (sum, current) => ({ x: sum.x + current.x, y: sum.y + current.y }),
      { x: 0, y: 0 },
    );
    const jitter = hash(node.id) % 17;
    simulation.nodes.set(node.id, {
      id: node.id,
      x: anchors.length > 0 ? anchor.x / anchors.length + jitter - 8 : 20 * Math.cos(index * GOLDEN_ANGLE),
      y: anchors.length > 0 ? anchor.y / anchors.length + (jitter % 5) - 2 : 20 * Math.sin(index * GOLDEN_ANGLE),
      vx: 0,
      vy: 0,
      pinned: false,
    });
    changed = true;
  });

  simulation.links = links;
  if (changed) {
    reheat(simulation, 0.7);
  }
  return changed;
}

export function reheat(simulation: Simulation, alpha = 0.8): void {
  simulation.alpha = Math.max(simulation.alpha, alpha);
}

export function isSettled(simulation: Simulation): boolean {
  return simulation.alpha <= STOP_ALPHA;
}

export function pinNode(simulation: Simulation, id: string, x: number, y: number): void {
  const node = simulation.nodes.get(id);
  if (!node) return;
  node.pinned = true;
  node.x = x;
  node.y = y;
  node.vx = 0;
  node.vy = 0;
}

export function unpinNode(simulation: Simulation, id: string): void {
  const node = simulation.nodes.get(id);
  if (node) {
    node.pinned = false;
  }
}

export function tick(simulation: Simulation, params: SimulationParams): void {
  if (isSettled(simulation)) return;
  const nodes = [...simulation.nodes.values()];
  const forces = new Map<string, { x: number; y: number }>(
    nodes.map((node) => [node.id, { x: 0, y: 0 }]),
  );

  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const a = nodes[left];
      const b = nodes[right];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distanceSquared = Math.max(dx * dx + dy * dy, 1);
      const distance = Math.sqrt(distanceSquared);
      const push = params.repulsion / distanceSquared;
      if (!a.pinned) {
        addForce(forces, a.id, (dx / distance) * push, (dy / distance) * push);
      }
      if (!b.pinned) {
        addForce(forces, b.id, -(dx / distance) * push, -(dy / distance) * push);
      }
    }
  }

  for (const link of simulation.links) {
    const source = simulation.nodes.get(link.source);
    const target = simulation.nodes.get(link.target);
    if (!source || !target) continue;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.max(Math.hypot(dx, dy), 1);
    const pull = ((distance - params.linkDistance) / distance) * params.linkStrength;
    if (!source.pinned) {
      addForce(forces, source.id, dx * pull, dy * pull);
    }
    if (!target.pinned) {
      addForce(forces, target.id, -dx * pull, -dy * pull);
    }
  }

  for (const node of nodes) {
    if (node.pinned) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    const force = forces.get(node.id) ?? { x: 0, y: 0 };
    node.vx =
      (node.vx + (force.x - node.x * params.centerStrength) * simulation.alpha) * DAMPING;
    node.vy =
      (node.vy + (force.y - node.y * params.centerStrength) * simulation.alpha) * DAMPING;
    node.vx = clamp(node.vx, -MAX_VELOCITY, MAX_VELOCITY);
    node.vy = clamp(node.vy, -MAX_VELOCITY, MAX_VELOCITY);
    node.x += node.vx;
    node.y += node.vy;
  }

  simulation.alpha *= DECAY;
}

function addForce(
  forces: Map<string, { x: number; y: number }>,
  id: string,
  x: number,
  y: number,
): void {
  const force = forces.get(id);
  if (!force) return;
  force.x += x;
  force.y += y;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) % 1000;
  }
  return result;
}
