import type { GraphKind, GraphModel } from "./model";
import type { Simulation } from "./simulation";
import { toScreen, type Point, type Viewport } from "./view";

export interface GraphPalette {
  node: string;
  topic: string;
  service: string;
  action: string;
  link: string;
  label: string;
  halo: string;
}

export const FALLBACK_PALETTE: GraphPalette = {
  node: "#4f8cff",
  topic: "#8a94a6",
  service: "#e8a33d",
  action: "#b267e6",
  link: "rgba(140, 150, 170, 0.55)",
  label: "#e8ecf4",
  halo: "rgba(12, 16, 24, 0.85)",
};

export const LABEL_SCALE = 0.9;

const TAU = Math.PI * 2;
const LINK_ALPHA = 0.55;
const DIM_ALPHA = 0.3;

export interface DrawOptions {
  width: number;
  height: number;
  viewport: Viewport;
  hoveredId: string | null;
  selectedId: string | null;
  palette: GraphPalette;
}

/** Resolves the theme colours from CSS custom properties, with sane fallbacks. */
export function paletteFromStyles(read: (property: string) => string): GraphPalette {
  const pick = (property: string, fallback: string) => read(property) || fallback;
  return {
    node: pick("--primary", FALLBACK_PALETTE.node),
    topic: pick("--muted-foreground", FALLBACK_PALETTE.topic),
    service: pick("--chart-4", FALLBACK_PALETTE.service),
    action: pick("--chart-5", FALLBACK_PALETTE.action),
    link: pick("--border", FALLBACK_PALETTE.link),
    label: pick("--foreground", FALLBACK_PALETTE.label),
    halo: pick("--card", FALLBACK_PALETTE.halo),
  };
}

export function drawGraph(
  context: CanvasRenderingContext2D,
  model: GraphModel,
  simulation: Simulation,
  options: DrawOptions,
): void {
  const { width, height, viewport, hoveredId, selectedId, palette } = options;
  context.clearRect(0, 0, width, height);

  const focusId = hoveredId ?? selectedId;
  const focus = neighbourhood(model, focusId);

  context.lineWidth = 1;
  context.strokeStyle = palette.link;
  for (const link of model.links) {
    const source = simulation.nodes.get(link.source);
    const target = simulation.nodes.get(link.target);
    if (!source || !target) continue;
    context.globalAlpha =
      focusId !== null && link.source !== focusId && link.target !== focusId
        ? DIM_ALPHA
        : LINK_ALPHA;
    const from = toScreen(source, viewport);
    const to = toScreen(target, viewport);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  for (const node of model.nodes) {
    const position = simulation.nodes.get(node.id);
    if (!position) continue;
    const point = toScreen(position, viewport);
    const radius = Math.max(2.5, node.radius * viewport.scale);
    const highlighted = node.id === hoveredId || node.id === selectedId;
    context.globalAlpha = focusId !== null && !focus.has(node.id) ? DIM_ALPHA : 1;
    drawShape(context, node.kind, point, radius, palette);

    if (highlighted) {
      context.beginPath();
      context.arc(point.x, point.y, radius + 3, 0, TAU);
      context.lineWidth = 2;
      context.strokeStyle = palette.label;
      context.stroke();
    }

    if (!highlighted && viewport.scale < LABEL_SCALE) continue;
    const text = node.label;
    const labelY = point.y + radius + 4;
    context.font = "11px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "top";
    context.lineWidth = 3;
    context.strokeStyle = palette.halo;
    context.strokeText(text, point.x, labelY);
    context.fillStyle = palette.label;
    context.fillText(text, point.x, labelY);
  }

  context.globalAlpha = 1;
}

function drawShape(
  context: CanvasRenderingContext2D,
  kind: GraphKind,
  point: Point,
  radius: number,
  palette: GraphPalette,
): void {
  const color = palette[kind];
  context.lineWidth = 1.5;
  context.strokeStyle = color;
  switch (kind) {
    case "topic":
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, TAU);
      context.stroke();
      return;
    case "service":
      polygon(context, point, radius, 4);
      context.fillStyle = color;
      context.fill();
      return;
    case "action":
      polygon(context, point, radius, 4, Math.PI / 4);
      context.fillStyle = color;
      context.fill();
      return;
    default:
      context.fillStyle = color;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, TAU);
      context.fill();
  }
}

function polygon(
  context: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  sides: number,
  rotation = 0,
): void {
  context.beginPath();
  for (let index = 0; index < sides; index += 1) {
    const angle = rotation + (index * TAU) / sides;
    const x = center.x + Math.cos(angle) * radius;
    const y = center.y + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function neighbourhood(model: GraphModel, focusId: string | null): Set<string> {
  const ids = new Set<string>();
  if (!focusId) return ids;
  ids.add(focusId);
  for (const link of model.links) {
    if (link.source === focusId) ids.add(link.target);
    if (link.target === focusId) ids.add(link.source);
  }
  return ids;
}
