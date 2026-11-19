import { describe, expect, it } from "vitest";

import type { GraphSnapshot } from "../../api/types";
import { buildGraph } from "./model";
import { FALLBACK_PALETTE, LABEL_SCALE, drawGraph, paletteFromStyles } from "./render";
import { createSimulation } from "./simulation";

const SNAPSHOT: GraphSnapshot = {
  nodes: [
    {
      name: "/talker",
      namespace: "/",
      publishers: ["/chatter"],
      subscribers: [],
      services: [],
      actions: [],
    },
    {
      name: "/listener",
      namespace: "/",
      publishers: [],
      subscribers: ["/chatter"],
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
  ],
  services: {},
  actions: {},
  revision: 1,
};

const RICH: GraphSnapshot = {
  nodes: [
    {
      name: "/talker",
      namespace: "/",
      publishers: [],
      subscribers: [],
      services: ["/talker/get_parameters"],
      actions: ["/talker/fibonacci"],
    },
  ],
  topics: [],
  services: { "/talker/get_parameters": ["rcl_interfaces/srv/GetParameters"] },
  actions: { "/talker/fibonacci": ["action_tutorials_interfaces/action/Fibonacci"] },
  revision: 1,
};

interface RecordedCall {
  op: string;
  args: unknown[];
  fill?: string;
  stroke?: string;
  alpha?: number;
}

function recorder() {
  const calls: RecordedCall[] = [];
  const context = {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    clearRect() {},
    setTransform() {},
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    setLineDash() {},
    arc(...args: unknown[]) {
      calls.push({ op: "arc", args, fill: this.fillStyle, stroke: this.strokeStyle, alpha: this.globalAlpha });
    },
    fill() {
      calls.push({ op: "fill", args: [], fill: this.fillStyle, alpha: this.globalAlpha });
    },
    stroke() {
      calls.push({ op: "stroke", args: [], stroke: this.strokeStyle, alpha: this.globalAlpha });
    },
    fillText(...args: unknown[]) {
      calls.push({ op: "fillText", args, fill: this.fillStyle, alpha: this.globalAlpha });
    },
    strokeText(...args: unknown[]) {
      calls.push({ op: "strokeText", args, stroke: this.strokeStyle });
    },
  };
  return { context: context as unknown as CanvasRenderingContext2D, calls };
}

function draw(snapshot: GraphSnapshot, scale = 1, hoveredId: string | null = null) {
  const model = buildGraph(snapshot);
  const { context, calls } = recorder();
  drawGraph(context, model, createSimulation(model), {
    width: 800,
    height: 600,
    viewport: { scale, tx: 400, ty: 300 },
    hoveredId,
    selectedId: null,
    palette: FALLBACK_PALETTE,
  });
  return calls;
}

describe("drawGraph", () => {
  it("draws a shape per node and a stroke per link", () => {
    const calls = draw(SNAPSHOT);

    expect(calls.filter((call) => call.op === "arc")).toHaveLength(3);
    expect(calls.filter((call) => call.op === "stroke").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the names at the default zoom and hides them far out", () => {
    const zoomedOut = draw(SNAPSHOT, LABEL_SCALE - 0.5);
    const zoomedIn = draw(SNAPSHOT);

    expect(zoomedOut.some((call) => call.op === "fillText")).toBe(false);
    const labels = zoomedIn
      .filter((call) => call.op === "fillText")
      .map((call) => call.args[0]);
    expect(labels).toContain("/talker");
  });

  it("labels the hovered node and dims everything outside its neighbourhood", () => {
    const calls = draw(SNAPSHOT, 1, "node:/talker");

    const labelOf = (name: string) =>
      calls.find((call) => call.op === "fillText" && call.args[0] === name);

    expect(labelOf("/talker")?.alpha).toBe(1);
    expect(labelOf("/listener")?.alpha).toBe(0.3);
    expect(calls.some((call) => call.alpha === 0.3)).toBe(true);
  });

  it("uses a different colour per kind", () => {
    const fills = draw(RICH)
      .filter((call) => call.op === "fill")
      .map((call) => call.fill);

    expect(fills).toContain(FALLBACK_PALETTE.node);
    expect(fills).toContain(FALLBACK_PALETTE.service);
    expect(fills).toContain(FALLBACK_PALETTE.action);
  });
});

describe("paletteFromStyles", () => {
  it("uses theme values and falls back when they are missing", () => {
    const palette = paletteFromStyles((property) =>
      property === "--primary" ? "oklch(0.6 0.2 250)" : "",
    );

    expect(palette.node).toBe("oklch(0.6 0.2 250)");
    expect(palette.topic).toBe(FALLBACK_PALETTE.topic);
  });
});
