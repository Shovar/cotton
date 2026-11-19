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

function bodyProps(overrides: Partial<TerminalBodyProps> = {}): TerminalBodyProps {
  return {
    records: [record("t1"), record("t2")],
    activeTerminalId: null,
    minimizedIds: [],
    canCreate: true,
    onCreate: vi.fn(),
    onMinimize: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };
}

function pane(container: HTMLElement, terminalId: string): HTMLElement | null {
  return container.querySelector(`[data-terminal-id="${terminalId}"]`);
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

    expect(pane(container, "t1")).toHaveAttribute("data-terminal-visible", "true");
    expect(pane(container, "t2")).toHaveAttribute("data-terminal-visible", "false");
    expect(pane(container, "t2")).toHaveAttribute("aria-hidden", "true");
    expect(pane(container, "t2")).toHaveAttribute("inert");
  });

  it("shows the active terminal and falls back to the first when it disappears", () => {
    const { container, rerender } = render(
      <TerminalBody {...bodyProps({ activeTerminalId: "t2" })} />,
    );

    expect(pane(container, "t2")).toHaveAttribute("data-terminal-visible", "true");
    expect(pane(container, "t1")).toHaveAttribute("data-terminal-visible", "false");

    rerender(<TerminalBody {...bodyProps({ activeTerminalId: "gone" })} />);

    expect(pane(container, "t1")).toHaveAttribute("data-terminal-visible", "true");
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
      <TerminalBody
        {...bodyProps({ activeTerminalId: "t1", onCreate, onMinimize })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New shell" }));
    fireEvent.click(screen.getByRole("button", { name: "Minimize terminal" }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onMinimize).toHaveBeenCalledTimes(1);
  });

  it("disables shell creation while no workspace is available", () => {
    render(<TerminalBody {...bodyProps({ canCreate: false })} />);

    expect(screen.getByRole("button", { name: "New shell" })).toBeDisabled();
  });

  it("does not mount minimized terminals", () => {
    const { container } = render(
      <TerminalBody {...bodyProps({ minimizedIds: ["t2"] })} />,
    );

    expect(pane(container, "t2")).toBeNull();
    expect(screen.queryByRole("tab", { name: "t2" })).not.toBeInTheDocument();
  });

  it("sends terminal input and resize for the owning terminal", () => {
    render(<TerminalBody {...bodyProps({ records: [record("t1")] })} />);
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
    const [, payload] = vi.mocked(ws.send).mock.calls.at(-1) as [
      string,
      { data: string },
    ];
    expect(atob(payload.data)).toHaveLength(40_000);

    view.onResize(80, 24);
    expect(ws.send).toHaveBeenCalledWith("terminal.resize", {
      id: "t1",
      cols: 80,
      rows: 24,
    });
  });
});
