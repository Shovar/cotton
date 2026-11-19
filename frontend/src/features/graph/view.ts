export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

export const MIN_SCALE = 0.15;
export const MAX_SCALE = 6;

export function toScreen(point: Point, viewport: Viewport): Point {
  return { x: point.x * viewport.scale + viewport.tx, y: point.y * viewport.scale + viewport.ty };
}

export function toWorld(point: Point, viewport: Viewport): Point {
  return { x: (point.x - viewport.tx) / viewport.scale, y: (point.y - viewport.ty) / viewport.scale };
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, tx: viewport.tx + dx, ty: viewport.ty + dy };
}

/** Zooms keeping the world point under the anchor fixed on screen. */
export function zoomAt(viewport: Viewport, factor: number, anchor: Point): Viewport {
  const scale = clamp(viewport.scale * factor, MIN_SCALE, MAX_SCALE);
  const world = toWorld(anchor, viewport);
  return { scale, tx: anchor.x - world.x * scale, ty: anchor.y - world.y * scale };
}

export function fitView(
  points: Iterable<Point>,
  width: number,
  height: number,
  padding = 56,
): Viewport {
  const list = [...points];
  if (list.length === 0) {
    return { scale: 1, tx: width / 2, ty: height / 2 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of list) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = clamp(
    Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY),
    MIN_SCALE,
    1.1,
  );
  return {
    scale,
    tx: width / 2 - ((minX + maxX) / 2) * scale,
    ty: height / 2 - ((minY + maxY) / 2) * scale,
  };
}

export function hitTest(
  targets: Iterable<{ id: string; x: number; y: number; radius: number }>,
  point: Point,
  tolerance = 4,
): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const target of targets) {
    const distance = Math.hypot(target.x - point.x, target.y - point.y);
    if (distance > target.radius + tolerance || distance >= bestDistance) continue;
    best = target.id;
    bestDistance = distance;
  }
  return best;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
