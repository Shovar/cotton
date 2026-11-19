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
      group_id: "grp_a1",
      kind: "shell",
      argv: ["/bin/sh"],
      cwd: "/tmp",
      env: {},
    },
    state: "running",
    pid: 10,
    started_at: null,
    exit_code: null,
    error: null,
  };
}

const DEFAULT_GROUP = { id: "default", name: "Default", terminalIds: ["t1"] };
const BUILD_GROUP = { id: "build", name: "Build", terminalIds: ["t2"] };

function bodyProps(overrides: Partial<TerminalBodyProps> = {}): TerminalBodyProps {
  return {
    groups: [DEFAULT_GROUP, BUILD_GROUP],
    selectedGroupId: "default",
    records: { t1: record("t1"), t2: record("t2") },
    activeTerminalByGroup: {},
    minimizedIds: [],
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
  it("mounts terminals from every group and shows only the selected group's active one", () => {
    const { container } = render(<TerminalBody {...bodyProps()} />);

    expect(pane(container, "t1")).toHaveAttribute("data-terminal-visible", "true");
    expect(pane(container, "t2")).toHaveAttribute("data-terminal-visible", "false");
    expect(pane(container, "t2")).toHaveAttribute("aria-hidden", "true");
    expect(pane(container, "t2")).toHaveAttribute("inert");
  });

  it("keeps the same terminal mounted when it moves to another group", () => {
    const { container, rerender } = render(<TerminalBody {...bodyProps()} />);
    const retained = pane(container, "t1");

    rerender(
      <TerminalBody
        {...bodyProps({
          groups: [
            { ...DEFAULT_GROUP, terminalIds: [] },
            { ...BUILD_GROUP, terminalIds: ["t2", "t1"] },
          ],
          selectedGroupId: "build",
          activeTerminalByGroup: { build: "t1" },
        })}
      />,
    );

    expect(pane(container, "t1")).toBe(retained);
    expect(pane(container, "t1")).toHaveAttribute("data-terminal-visible", "true");
    expect(pane(container, "t2")).toHaveAttribute("data-terminal-visible", "false");
  });

  it("shows the active terminal of the selected group and falls back to the first", () => {
    const { container, rerender } = render(
      <TerminalBody
        {...bodyProps({
          groups: [{ ...DEFAULT_GROUP, terminalIds: ["t1", "t3"] }],
          records: { t1: record("t1"), t3: record("t3") },
          activeTerminalByGroup: { default: "t3" },
        })}
      />,
    );

    expect(pane(container, "t3")).toHaveAttribute("data-terminal-visible", "true");
    expect(pane(container, "t1")).toHaveAttribute("data-terminal-visible", "false");

    rerender(
      <TerminalBody
        {...bodyProps({
          groups: [{ ...DEFAULT_GROUP, terminalIds: ["t1", "t3"] }],
          records: { t1: record("t1"), t3: record("t3") },
          activeTerminalByGroup: { default: "gone" },
        })}
      />,
    );

    expect(pane(container, "t1")).toHaveAttribute("data-terminal-visible", "true");
  });

  it("lists the selected group's terminals as tabs and selects on click", () => {
    const onSelect = vi.fn();
    render(
      <TerminalBody
        {...bodyProps({
          groups: [{ ...DEFAULT_GROUP, terminalIds: ["t1", "t3"] }],
          records: { t1: record("t1"), t3: record("t3") },
          activeTerminalByGroup: { default: "t3" },
          onSelect,
        })}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["t1", "t3"]);
    expect(screen.getByRole("tab", { name: "t3" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(screen.getByRole("tab", { name: "t1" }));

    expect(onSelect).toHaveBeenCalledWith("t1");
  });

  it("does not mount minimized terminals", () => {
    const { container } = render(
      <TerminalBody {...bodyProps({ minimizedIds: ["t2"] })} />,
    );

    expect(pane(container, "t2")).toBeNull();
    expect(screen.queryByRole("tab", { name: "t2" })).not.toBeInTheDocument();
  });

  it("sends terminal input and resize for the owning terminal", () => {
    render(
      <TerminalBody
        {...bodyProps({ groups: [DEFAULT_GROUP], records: { t1: record("t1") } })}
      />,
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
