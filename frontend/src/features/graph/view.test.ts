import { describe, expect, it } from "vitest";

import {
  MAX_SCALE,
  MIN_SCALE,
  fitView,
  hitTest,
  panBy,
  toScreen,
  toWorld,
  zoomAt,
} from "./view";

describe("viewport", () => {
  it("round-trips world and screen points", () => {
    const viewport = { scale: 1.5, tx: 30, ty: -20 };

    const screen = toScreen({ x: 10, y: 40 }, viewport);

    expect(screen).toEqual({ x: 45, y: 40 });
    expect(toWorld(screen, viewport)).toEqual({ x: 10, y: 40 });
  });

  it("keeps the anchor fixed under the cursor when zooming", () => {
    const viewport = { scale: 1, tx: 0, ty: 0 };
    const anchor = { x: 200, y: 100 };

    const zoomed = zoomAt(viewport, 2, anchor);

    expect(zoomed.scale).toBe(2);
    expect(toWorld(anchor, zoomed)).toEqual(toWorld(anchor, viewport));
  });

  it("clamps the zoom range", () => {
    expect(zoomAt({ scale: 1, tx: 0, ty: 0 }, 1000, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: 1, tx: 0, ty: 0 }, 0.0001, { x: 0, y: 0 }).scale).toBe(MIN_SCALE);
  });

  it("pans by screen pixels", () => {
    expect(panBy({ scale: 1, tx: 5, ty: 5 }, 10, -3)).toEqual({ scale: 1, tx: 15, ty: 2 });
  });

  it("fits the points inside the viewport", () => {
    const viewport = fitView(
      [
        { x: -100, y: -50 },
        { x: 100, y: 50 },
      ],
      400,
      200,
    );

    const center = toScreen({ x: 0, y: 0 }, viewport);
    expect(center.x).toBeCloseTo(200);
    expect(center.y).toBeCloseTo(100);
    expect(viewport.scale).toBeGreaterThan(0);
  });

  it("centers an empty view", () => {
    expect(fitView([], 400, 200)).toEqual({ scale: 1, tx: 200, ty: 100 });
  });
});

describe("hit testing", () => {
  const targets = [
    { id: "a", x: 0, y: 0, radius: 10 },
    { id: "b", x: 20, y: 0, radius: 4 },
  ];

  it("picks the closest target inside its radius", () => {
    expect(hitTest(targets, { x: 2, y: 0 })).toBe("a");
    expect(hitTest(targets, { x: 20, y: 0 })).toBe("b");
  });

  it("ignores clicks far away", () => {
    expect(hitTest(targets, { x: 200, y: 0 })).toBeNull();
  });

  it("accepts a tolerance for small hit areas", () => {
    const small = [{ id: "a", x: 0, y: 0, radius: 2 }];

    expect(hitTest(small, { x: 7, y: 0 })).toBeNull();
    expect(hitTest(small, { x: 7, y: 0 }, 6)).toBe("a");
  });
});
