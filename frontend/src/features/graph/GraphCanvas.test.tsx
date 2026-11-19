import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GraphSnapshot } from "../../api/types";
import { GraphCanvas } from "./GraphCanvas";
import { buildGraph, type GraphModel } from "./model";

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
  ],
  topics: [
    {
      name: "/chatter",
      types: ["std_msgs/msg/String"],
      publishers: ["/talker"],
      subscribers: [],
    },
  ],
  services: {},
  actions: {},
  revision: 1,
};

function renderCanvas(model: GraphModel, onSelect = vi.fn()) {
  return render(<GraphCanvas model={model} selectedId={null} onSelect={onSelect} />);
}

function canvasOf(container: HTMLElement): HTMLCanvasElement {
  const canvas = container.querySelector("canvas");
  if (!canvas) throw new Error("missing canvas");
  return canvas;
}

describe("GraphCanvas", () => {
  it("draws the graph and exposes every point to the keyboard", () => {
    const onSelect = vi.fn();
    renderCanvas(buildGraph(SNAPSHOT), onSelect);

    expect(screen.getByRole("group", { name: "Nodes and topics graph" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "/chatter" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "/talker" }));

    expect(onSelect).toHaveBeenCalledWith({ kind: "node", name: "/talker" });
  });

  it("selects the node under the pointer", () => {
    const onSelect = vi.fn();
    const { container } = renderCanvas(buildGraph(SNAPSHOT), onSelect);

    // The simulation starts at the origin and the viewport centers on the canvas.
    fireEvent(
      canvasOf(container),
      new MouseEvent("pointerdown", { clientX: 480, clientY: 260, bubbles: true }),
    );

    expect(onSelect).toHaveBeenCalledWith({ kind: "node", name: "/talker" });
  });

  it("does not select anything when clicking empty space", () => {
    const onSelect = vi.fn();
    const { container } = renderCanvas(buildGraph(SNAPSHOT), onSelect);

    fireEvent(
      canvasOf(container),
      new MouseEvent("pointerdown", { clientX: 20, clientY: 20, bubbles: true }),
    );

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("marks the selected point", () => {
    const model = buildGraph(SNAPSHOT);
    render(<GraphCanvas model={model} selectedId="topic:/chatter" onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: "/chatter" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("says so explicitly when there is nothing to draw", () => {
    renderCanvas(buildGraph({ nodes: [], topics: [], services: {}, actions: {}, revision: 0 }));

    expect(screen.getByText("No nodes or topics")).toBeInTheDocument();
  });

  it("says so explicitly when the browser has no 2d canvas", async () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    renderCanvas(buildGraph(SNAPSHOT));

    expect(await screen.findByText("Graph rendering is not available")).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
  });
});
