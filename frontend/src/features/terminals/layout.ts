export type SplitDirection = "row" | "column";

export type PaneSide = "left" | "right" | "top" | "bottom";

export interface PaneNode {
  type: "pane";
  id: string;
  tabs: string[];
}

export interface SplitNode {
  type: "split";
  direction: SplitDirection;
  sizes: number[];
  children: LayoutNode[];
}

export type LayoutNode = PaneNode | SplitNode;

const DEFAULT_PANE_ID = "pane";

function newPaneId(): string {
  return `pane-${Math.random().toString(36).slice(2, 10)}`;
}

function directionOf(side: PaneSide): SplitDirection {
  return side === "left" || side === "right" ? "row" : "column";
}

function isBefore(side: PaneSide): boolean {
  return side === "left" || side === "top";
}

function normalizeSizes(sizes: number[], count: number): number[] {
  const valid =
    sizes.length === count &&
    sizes.every((size) => Number.isFinite(size) && size > 0);
  return valid ? sizes : Array.from({ length: count }, () => 1);
}

export function firstPaneId(node: LayoutNode): string {
  return node.type === "pane" ? node.id : firstPaneId(node.children[0]);
}

export function findPane(node: LayoutNode, paneId: string): PaneNode | null {
  if (node.type === "pane") {
    return node.id === paneId ? node : null;
  }
  for (const child of node.children) {
    const found = findPane(child, paneId);
    if (found) {
      return found;
    }
  }
  return null;
}

export function paneIdOf(node: LayoutNode, terminalId: string | null): string | null {
  if (terminalId === null) {
    return null;
  }
  if (node.type === "pane") {
    return node.tabs.includes(terminalId) ? node.id : null;
  }
  for (const child of node.children) {
    const found = paneIdOf(child, terminalId);
    if (found) {
      return found;
    }
  }
  return null;
}

function normalizeNode(
  node: LayoutNode,
  live: Set<string>,
  placed: Set<string>,
): LayoutNode | null {
  if (node.type === "pane") {
    const tabs = node.tabs.filter((id) => live.has(id) && !placed.has(id));
    for (const id of tabs) {
      placed.add(id);
    }
    return tabs.length === 0 ? null : { type: "pane", id: node.id, tabs };
  }
  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((child, index) => {
    const normalized = normalizeNode(child, live, placed);
    if (normalized) {
      children.push(normalized);
      sizes.push(node.sizes[index] ?? 1);
    }
  });
  if (children.length === 0) {
    return null;
  }
  if (children.length === 1) {
    return children[0];
  }
  return {
    type: "split",
    direction: node.direction,
    children,
    sizes: normalizeSizes(sizes, children.length),
  };
}

function appendToFirstPane(node: LayoutNode, terminalIds: string[]): LayoutNode {
  if (node.type === "pane") {
    return { ...node, tabs: [...node.tabs, ...terminalIds] };
  }
  return {
    ...node,
    children: [appendToFirstPane(node.children[0], terminalIds), ...node.children.slice(1)],
  };
}

export function normalizeLayout(
  node: LayoutNode | null,
  terminalIds: string[],
): LayoutNode {
  const live = new Set(terminalIds);
  const placed = new Set<string>();
  const normalized = node ? normalizeNode(node, live, placed) : null;
  const missing = terminalIds.filter((id) => !placed.has(id));
  if (!normalized) {
    return { type: "pane", id: node ? firstPaneId(node) : DEFAULT_PANE_ID, tabs: missing };
  }
  return missing.length === 0 ? normalized : appendToFirstPane(normalized, missing);
}

function removeTerminal(node: LayoutNode, terminalId: string): LayoutNode {
  if (node.type === "pane") {
    return node.tabs.includes(terminalId)
      ? { ...node, tabs: node.tabs.filter((id) => id !== terminalId) }
      : node;
  }
  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  let changed = false;
  node.children.forEach((child, index) => {
    const next = removeTerminal(child, terminalId);
    changed ||= next !== child;
    if (next.type === "split" || next.tabs.length > 0) {
      children.push(next);
      sizes.push(node.sizes[index] ?? 1);
    }
  });
  if (!changed) {
    return node;
  }
  if (children.length === 1) {
    return children[0];
  }
  return { type: "split", direction: node.direction, children, sizes };
}

function appendToPane(node: LayoutNode, paneId: string, terminalId: string): LayoutNode {
  if (node.type === "pane") {
    return node.id === paneId ? { ...node, tabs: [...node.tabs, terminalId] } : node;
  }
  return {
    ...node,
    children: node.children.map((child) => appendToPane(child, paneId, terminalId)),
  };
}

function splitAtSide(side: PaneSide, pane: PaneNode, existing: LayoutNode): SplitNode {
  const before = isBefore(side);
  return {
    type: "split",
    direction: directionOf(side),
    children: before ? [pane, existing] : [existing, pane],
    sizes: [1, 1],
  };
}

function insertBeside(
  node: LayoutNode,
  paneId: string,
  pane: PaneNode,
  side: PaneSide,
): LayoutNode {
  if (node.type === "pane") {
    return splitAtSide(side, pane, node);
  }
  const index = node.children.findIndex((child) => findPane(child, paneId) !== null);
  if (index === -1) {
    return node;
  }
  const child = node.children[index];
  if (child.type === "pane" && node.direction === directionOf(side)) {
    const size = (node.sizes[index] ?? 1) / 2;
    const before = isBefore(side);
    return {
      ...node,
      children: [
        ...node.children.slice(0, index),
        before ? pane : child,
        before ? child : pane,
        ...node.children.slice(index + 1),
      ],
      sizes: [...node.sizes.slice(0, index), size, size, ...node.sizes.slice(index + 1)],
    };
  }
  const replacement =
    child.type === "pane"
      ? splitAtSide(side, pane, child)
      : insertBeside(child, paneId, pane, side);
  return {
    ...node,
    children: node.children.map((current, position) =>
      position === index ? replacement : current,
    ),
  };
}

export function moveIntoPane(
  root: LayoutNode,
  terminalId: string,
  paneId: string,
): LayoutNode {
  const target = findPane(root, paneId);
  if (!target || target.tabs.includes(terminalId)) {
    return root;
  }
  return appendToPane(removeTerminal(root, terminalId), paneId, terminalId);
}

export function splitPane(
  root: LayoutNode,
  terminalId: string,
  paneId: string,
  side: PaneSide,
): LayoutNode {
  const target = findPane(root, paneId);
  if (!target || (target.tabs.length === 1 && target.tabs[0] === terminalId)) {
    return root;
  }
  return insertBeside(
    removeTerminal(root, terminalId),
    paneId,
    { type: "pane", id: newPaneId(), tabs: [terminalId] },
    side,
  );
}

export function resizeSizes(
  sizes: number[],
  index: number,
  deltaWeight: number,
  minWeight: number,
): number[] {
  const left = sizes[index];
  const right = sizes[index + 1];
  if (left === undefined || right === undefined) {
    return sizes;
  }
  const lower = Math.min(minWeight - left, 0);
  const upper = Math.max(right - minWeight, 0);
  const delta = Math.min(Math.max(deltaWeight, lower), upper);
  if (delta === 0) {
    return sizes;
  }
  const next = [...sizes];
  next[index] = left + delta;
  next[index + 1] = right - delta;
  return next;
}

export function setSizesAt(
  node: LayoutNode,
  path: number[],
  sizes: number[],
): LayoutNode {
  if (path.length === 0) {
    return node.type === "split" ? { ...node, sizes } : node;
  }
  if (node.type !== "split") {
    return node;
  }
  const [index, ...rest] = path;
  const child = node.children[index];
  if (!child) {
    return node;
  }
  return {
    ...node,
    children: node.children.map((current, position) =>
      position === index ? setSizesAt(child, rest, sizes) : current,
    ),
  };
}
