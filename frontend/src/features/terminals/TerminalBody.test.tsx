import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TerminalRecord } from "../../api/types";

const views = vi.hoisted(() => ({
  current: null as null | {
    terminalId: string;
    onInput: (data: string) => void;
    onResize: (cols: number, rows: number) => void;
  },
}));

vi.mock("../../api/ws", () => ({
  ws: { send: vi.fn(), subscribe: vi.fn(), onEvent: vi.fn(() => () => {}) },
}));
vi.mock("./TerminalView", () => ({
  TerminalView: ({
    terminalId,
    onInput,
    onResize,
  }: {
    terminalId: string;
    onInput: (data: string) => void;
    onResize: (cols: number, rows: number) => void;
  }) => {
    views.current = { terminalId, onInput, onResize };
    return <div role="application" aria-label={`Terminal ${terminalId}`} />;
  },
}));

import { ws } from "../../api/ws";
import { TerminalBody, type TerminalBodyProps } from "./TerminalBody";
import type { LayoutNode, PaneNode } from "./layout";
import { useTerminalStore } from "./terminalStore";

function record(id: string): TerminalRecord {
  return {
    spec: {
      id,
      workspace_id: "ws_a",
      group_id: "ws_a_default",
      kind: "shell",
      argv: ["/bin/sh"],
      cwd: "/tmp/ws_a",
      env: {},
    },
    state: "running",
    pid: 10,
    started_at: null,
    exit_code: null,
    error: null,
  };
}

function pane(id: string, tabs: string[]): PaneNode {
  return { type: "pane", id, tabs };
}

function splitRow(...children: LayoutNode[]): LayoutNode {
  return {
    type: "split",
    direction: "row",
    sizes: children.map(() => 1),
    children,
  };
}

function bodyProps(overrides: Partial<TerminalBodyProps> = {}): TerminalBodyProps {
  return {
    records: [record("t1"), record("t2")],
    panes: pane("a", ["t1", "t2"]),
    activeTerminalId: null,
    canCreate: true,
    onCreate: vi.fn(),
    onMinimize: vi.fn(),
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onMove: vi.fn(),
    onResize: vi.fn(),
    ...overrides,
  };
}

function paneElement(container: HTMLElement, terminalId: string): HTMLElement | null {
  return container.querySelector(`[data-terminal-id="${terminalId}"]`);
}

function dataTransfer(): DataTransfer {
  return { setData: vi.fn(), effectAllowed: "move" } as unknown as DataTransfer;
}

function dockEdge(container: HTMLElement, side: string): HTMLElement {
  const edge = container.querySelector(`[data-dock-side="${side}"]`);
  if (!(edge instanceof HTMLElement)) {
    throw new Error(`Missing dock edge ${side}`);
  }
  return edge;
}

beforeEach(() => {
  useTerminalStore.setState({
    records: {},
    lastSequences: {},
    outputChunks: {},
    outputBytes: {},
    visibleAttachments: {},
    connection: "closed",
  });
});

describe("TerminalBody", () => {
  it("shows the first terminal and keeps the rest mounted but hidden", () => {
    const { container } = render(<TerminalBody {...bodyProps()} />);

    expect(paneElement(container, "t1")).toHaveAttribute("data-terminal-visible", "true");
    expect(paneElement(container, "t2")).toHaveAttribute("data-terminal-visible", "false");
    expect(paneElement(container, "t2")).toHaveAttribute("aria-hidden", "true");
    expect(paneElement(container, "t2")).toHaveAttribute("inert");
  });

  it("shows the active terminal and falls back to the first when it disappears", () => {
    const { container, rerender } = render(
      <TerminalBody {...bodyProps({ activeTerminalId: "t2" })} />,
    );

    expect(paneElement(container, "t2")).toHaveAttribute("data-terminal-visible", "true");
    expect(paneElement(container, "t1")).toHaveAttribute("data-terminal-visible", "false");

    rerender(<TerminalBody {...bodyProps({ activeTerminalId: "gone" })} />);

    expect(paneElement(container, "t1")).toHaveAttribute("data-terminal-visible", "true");
  });

  it("shows one active terminal per mosaic pane", () => {
    const { container } = render(
      <TerminalBody
        {...bodyProps({
          panes: splitRow(pane("a", ["t1"]), pane("b", ["t2"])),
        })}
      />,
    );

    expect(paneElement(container, "t1")).toHaveAttribute("data-terminal-visible", "true");
    expect(paneElement(container, "t2")).toHaveAttribute("data-terminal-visible", "true");
    expect(screen.getAllByRole("tablist")).toHaveLength(2);
  });

  it("lists the terminals as tabs and selects on click", () => {
    const onSelect = vi.fn();
    render(<TerminalBody {...bodyProps({ activeTerminalId: "t2", onSelect })} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["t1", "t2"]);
    expect(screen.getByRole("tab", { name: "t2" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(screen.getByRole("tab", { name: "t1" }));

    expect(onSelect).toHaveBeenCalledWith("t1");
  });

  it("creates and minimizes shells from the tab bar", () => {
    const onCreate = vi.fn();
    const onMinimize = vi.fn();
    render(
      <TerminalBody {...bodyProps({ activeTerminalId: "t1", onCreate, onMinimize })} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New shell" }));
    fireEvent.click(screen.getByRole("button", { name: "Minimize terminal" }));

    expect(onCreate).toHaveBeenCalledWith("a");
    expect(onMinimize).toHaveBeenCalledTimes(1);
  });

  it("closes a terminal from its own tab", () => {
    const onClose = vi.fn();
    render(<TerminalBody {...bodyProps({ onClose })} />);

    fireEvent.click(screen.getByRole("button", { name: "Close terminal t2" }));

    expect(onClose).toHaveBeenCalledWith(record("t2"));
  });

  it("ignores closing a tab whose session is not loaded yet", () => {
    const onClose = vi.fn();
    render(<TerminalBody {...bodyProps({ panes: pane("a", ["ghost"]), onClose })} />);

    fireEvent.click(screen.getByRole("button", { name: "Close terminal ghost" }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables shell creation while no workspace is available", () => {
    render(<TerminalBody {...bodyProps({ canCreate: false })} />);

    expect(screen.getByRole("button", { name: "New shell" })).toBeDisabled();
  });

  it("does not mount terminals missing from the mosaic", () => {
    const { container } = render(
      <TerminalBody {...bodyProps({ panes: pane("a", ["t1"]) })} />,
    );

    expect(paneElement(container, "t2")).toBeNull();
    expect(screen.queryByRole("tab", { name: "t2" })).not.toBeInTheDocument();
  });

  it("exposes the four docking edges only while dragging and highlights just the hovered one", () => {
    const { container } = render(<TerminalBody {...bodyProps()} />);

    expect(container.querySelectorAll("[data-dock-side]")).toHaveLength(0);

    fireEvent.dragStart(screen.getByRole("tab", { name: "t2" }), {
      dataTransfer: dataTransfer(),
    });

    expect(container.querySelectorAll("[data-dock-side]")).toHaveLength(4);
    const edge = dockEdge(container, "right");
    expect(edge).toHaveClass("border-transparent");
    expect(edge).not.toHaveClass("border-primary");

    fireEvent.dragOver(edge);

    expect(edge).toHaveClass("border-primary");
    expect(dockEdge(container, "left")).toHaveClass("border-transparent");

    fireEvent.dragLeave(edge);

    expect(edge).toHaveClass("border-transparent");

    fireEvent.dragEnd(screen.getByRole("tab", { name: "t2" }));

    expect(container.querySelectorAll("[data-dock-side]")).toHaveLength(0);
  });

  it.each(["left", "right", "top", "bottom"] as const)(
    "docks a dragged tab on the %s edge",
    (side) => {
      const onMove = vi.fn();
      const { container } = render(<TerminalBody {...bodyProps({ onMove })} />);

      fireEvent.dragStart(screen.getByRole("tab", { name: "t2" }), {
        dataTransfer: dataTransfer(),
      });
      fireEvent.drop(dockEdge(container, side));

      expect(onMove).toHaveBeenCalledWith("t2", "a", side);
    },
  );

  it("moves a terminal into another pane when its tab is dropped on that tab bar", () => {
    const onMove = vi.fn();
    render(
      <TerminalBody
        {...bodyProps({
          panes: splitRow(pane("a", ["t1"]), pane("b", ["t2"])),
          onMove,
        })}
      />,
    );

    fireEvent.dragStart(screen.getByRole("tab", { name: "t2" }), {
      dataTransfer: dataTransfer(),
    });
    fireEvent.drop(screen.getAllByRole("tablist")[0]);

    expect(onMove).toHaveBeenCalledWith("t2", "a");
  });

  it("resizes neighbouring panes when the divider is dragged", () => {
    const onResize = vi.fn();
    const { container } = render(
      <TerminalBody
        {...bodyProps({
          panes: splitRow(pane("a", ["t1"]), pane("b", ["t2"])),
          onResize,
        })}
      />,
    );
    const split = container.querySelector('[data-split="row"]');
    if (!(split instanceof HTMLElement)) {
      throw new Error("The mosaic split was not rendered");
    }
    split.getBoundingClientRect = () =>
      ({ width: 1000, height: 600, top: 0, left: 0, right: 1000, bottom: 600 }) as DOMRect;

    fireEvent.mouseDown(screen.getByRole("separator"), { clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 600 });
    fireEvent.mouseUp(window);

    const [, sizes] = vi.mocked(onResize).mock.calls.at(-1) as [number[], number[]];
    expect(sizes[0]).toBeCloseTo(1.2);
    expect(sizes[1]).toBeCloseTo(0.8);
    expect(onResize).toHaveBeenCalledWith([], expect.any(Array));
  });

  it("resizes stacked panes when the column divider is dragged", () => {
    const onResize = vi.fn();
    const panes: LayoutNode = {
      type: "split",
      direction: "column",
      sizes: [1, 1],
      children: [pane("a", ["t1"]), pane("b", ["t2"])],
    };
    const { container } = render(<TerminalBody {...bodyProps({ panes, onResize })} />);
    const split = container.querySelector('[data-split="column"]');
    if (!(split instanceof HTMLElement)) {
      throw new Error("The mosaic split was not rendered");
    }
    split.getBoundingClientRect = () =>
      ({ width: 800, height: 400, top: 0, left: 0, right: 800, bottom: 400 }) as DOMRect;

    fireEvent.mouseDown(screen.getByRole("separator"), { clientY: 200 });
    fireEvent.mouseMove(window, { clientY: 240 });
    fireEvent.mouseUp(window);

    const [path, sizes] = vi.mocked(onResize).mock.calls.at(-1) as [number[], number[]];
    expect(path).toEqual([]);
    expect(sizes[0]).toBeCloseTo(1.2);
    expect(sizes[1]).toBeCloseTo(0.8);
  });

  it("ignores divider drags while the panes have no measured size", () => {
    const onResize = vi.fn();
    render(
      <TerminalBody
        {...bodyProps({ panes: splitRow(pane("a", ["t1"]), pane("b", ["t2"])), onResize })}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("separator"), { clientX: 0 });
    fireEvent.mouseMove(window, { clientX: 100 });
    fireEvent.mouseUp(window);

    expect(onResize).not.toHaveBeenCalled();
  });

  it("sends terminal input and resize for the owning terminal", () => {
    render(
      <TerminalBody {...bodyProps({ records: [record("t1")], panes: pane("a", ["t1"]) })} />,
    );
    const view = views.current;
    if (!view) {
      throw new Error("TerminalView was not mounted");
    }

    view.onInput("hi");
    expect(ws.send).toHaveBeenCalledWith("terminal.input", {
      id: "t1",
      data: btoa("hi"),
    });

    view.onInput("a".repeat(40_000));
    const [, payload] = vi.mocked(ws.send).mock.calls.at(-1) as [string, { data: string }];
    expect(atob(payload.data)).toHaveLength(40_000);

    view.onResize(80, 24);
    expect(ws.send).toHaveBeenCalledWith("terminal.resize", {
      id: "t1",
      cols: 80,
      rows: 24,
    });
  });
});
