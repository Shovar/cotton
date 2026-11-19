import { describe, expect, it } from "vitest";

import {
  findPane,
  moveIntoPane,
  normalizeLayout,
  paneIdOf,
  resizeSizes,
  setSizesAt,
  splitPane,
  type LayoutNode,
  type PaneNode,
} from "./layout";

function pane(id: string, tabs: string[]): PaneNode {
  return { type: "pane", id, tabs };
}

function shape(node: LayoutNode): unknown {
  return node.type === "pane"
    ? node.tabs
    : { [node.direction]: node.children.map(shape), sizes: node.sizes };
}

function tabsOf(node: LayoutNode, paneId: string): string[] | undefined {
  return findPane(node, paneId)?.tabs;
}

describe("terminal mosaic", () => {
  it("keeps live terminals in their pane and appends unknown ones to the first", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "row",
      sizes: [2, 1],
      children: [pane("a", ["t2"]), pane("b", ["gone"])],
    };

    expect(shape(normalizeLayout(tree, ["t1", "t2"]))).toEqual(["t2", "t1"]);
    expect(shape(normalizeLayout(null, ["t1"]))).toEqual(["t1"]);
    expect(shape(normalizeLayout(pane("a", ["gone"]), []))).toEqual([]);
  });

  it("keeps custom split sizes while the tree stays valid", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "column",
      sizes: [3, 1],
      children: [pane("a", ["t1"]), pane("b", ["t2"])],
    };

    expect(shape(normalizeLayout(tree, ["t1", "t2"]))).toEqual({
      column: [["t1"], ["t2"]],
      sizes: [3, 1],
    });
  });

  it("drops duplicated terminals so each one lives in a single pane", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "row",
      sizes: [1, 1],
      children: [pane("a", ["t1", "t2"]), pane("b", ["t1"])],
    };

    expect(shape(normalizeLayout(tree, ["t1", "t2"]))).toEqual(["t1", "t2"]);
  });

  it("moves a terminal into another pane and prunes the emptied one", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "row",
      sizes: [1, 1],
      children: [pane("a", ["t1", "t2"]), pane("b", ["t3"])],
    };

    const moved = moveIntoPane(tree, "t2", "b");
    expect(tabsOf(moved, "a")).toEqual(["t1"]);
    expect(tabsOf(moved, "b")).toEqual(["t3", "t2"]);

    expect(shape(moveIntoPane(tree, "t3", "a"))).toEqual(["t1", "t2", "t3"]);
  });

  it("appends a new terminal to the requested pane", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "row",
      sizes: [1, 1],
      children: [pane("a", ["t1"]), pane("b", ["t2"])],
    };

    expect(tabsOf(moveIntoPane(tree, "t9", "b"), "b")).toEqual(["t2", "t9"]);
  });

  it("ignores a drop into the pane that already owns the terminal", () => {
    const tree: LayoutNode = pane("a", ["t1", "t2"]);
    expect(moveIntoPane(tree, "t1", "a")).toBe(tree);
  });

  it("splits a new pane on any side of the target", () => {
    const tree = pane("a", ["t1", "t2"]);

    expect(shape(splitPane(tree, "t2", "a", "right"))).toEqual({
      row: [["t1"], ["t2"]],
      sizes: [1, 1],
    });
    expect(shape(splitPane(tree, "t1", "a", "left"))).toEqual({
      row: [["t1"], ["t2"]],
      sizes: [1, 1],
    });
    expect(shape(splitPane(tree, "t1", "a", "top"))).toEqual({
      column: [["t1"], ["t2"]],
      sizes: [1, 1],
    });
    expect(shape(splitPane(tree, "t1", "a", "bottom"))).toEqual({
      column: [["t2"], ["t1"]],
      sizes: [1, 1],
    });
  });

  it("adds a sibling split in the same direction and shares the target's size", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "row",
      sizes: [1, 1],
      children: [pane("a", ["t1", "t2"]), pane("b", ["t3", "t4"])],
    };

    expect(shape(splitPane(tree, "t2", "b", "right"))).toEqual({
      row: [["t1"], ["t3", "t4"], ["t2"]],
      sizes: [1, 0.5, 0.5],
    });
  });

  it("nests a split when the requested side uses the other axis", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "row",
      sizes: [1, 1],
      children: [pane("a", ["t1", "t2"]), pane("b", ["t3", "t4"])],
    };

    expect(shape(splitPane(tree, "t4", "b", "bottom"))).toEqual({
      row: [["t1", "t2"], { column: [["t3"], ["t4"]], sizes: [1, 1] }],
      sizes: [1, 1],
    });
  });

  it("ignores splitting the only tab of a pane", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "row",
      sizes: [1, 1],
      children: [pane("a", ["t1"]), pane("b", ["t2"])],
    };

    expect(splitPane(tree, "t1", "a", "right")).toBe(tree);
  });

  it("resizes two neighbours within their minimum size", () => {
    expect(resizeSizes([1, 1], 0, 0.2, 0.1)).toEqual([1.2, 0.8]);
    expect(resizeSizes([1, 1], 0, 5, 0.25)).toEqual([1.75, 0.25]);
    expect(resizeSizes([0.1, 1], 0, -5, 0.2)).toEqual([0.1, 1]);
    expect(resizeSizes([1], 0, 0.2, 0.1)).toEqual([1]);
  });

  it("updates the sizes of the split at a path", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "row",
      sizes: [1, 1],
      children: [
        pane("a", ["t1"]),
        {
          type: "split",
          direction: "column",
          sizes: [1, 1],
          children: [pane("b", ["t2"]), pane("c", ["t3"])],
        },
      ],
    };

    expect(shape(setSizesAt(tree, [1], [3, 1]))).toEqual({
      row: [["t1"], { column: [["t2"], ["t3"]], sizes: [3, 1] }],
      sizes: [1, 1],
    });
    expect(shape(setSizesAt(tree, [], [2, 3]))).toEqual({
      row: [["t1"], { column: [["t2"], ["t3"]], sizes: [1, 1] }],
      sizes: [2, 3],
    });
  });

  it("locates the pane that owns a terminal", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "row",
      sizes: [1, 1],
      children: [pane("a", ["t1"]), pane("b", ["t2"])],
    };

    expect(paneIdOf(tree, "t2")).toBe("b");
    expect(paneIdOf(tree, "missing")).toBeNull();
    expect(paneIdOf(tree, null)).toBeNull();
  });

  it("falls back to equal sizes when the stored sizes do not fit the panes", () => {
    const short = {
      type: "split",
      direction: "row",
      sizes: [1],
      children: [pane("a", ["t1"]), pane("b", ["t2"])],
    } as LayoutNode;
    const invalid = {
      type: "split",
      direction: "row",
      sizes: [0, 1],
      children: [pane("a", ["t1"]), pane("b", ["t2"])],
    } as LayoutNode;

    expect(shape(normalizeLayout(short, ["t1", "t2"]))).toEqual({
      row: [["t1"], ["t2"]],
      sizes: [1, 1],
    });
    expect(shape(normalizeLayout(invalid, ["t1", "t2"]))).toEqual({
      row: [["t1"], ["t2"]],
      sizes: [1, 1],
    });
  });

  it("ignores pane targets that are no longer in the mosaic", () => {
    const tree = pane("a", ["t1", "t2"]);

    expect(moveIntoPane(tree, "t1", "missing")).toBe(tree);
    expect(splitPane(tree, "t1", "missing", "left")).toBe(tree);
  });

  it("ignores size updates for paths that do not address a split", () => {
    const tree = pane("a", ["t1"]);
    const split: LayoutNode = {
      type: "split",
      direction: "row",
      sizes: [1, 1],
      children: [pane("a", ["t1"]), pane("b", ["t2"])],
    };

    expect(setSizesAt(tree, [], [2])).toBe(tree);
    expect(setSizesAt(tree, [0], [2])).toBe(tree);
    expect(setSizesAt(split, [7], [2])).toBe(split);
  });
});
