import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TerminalRecord } from "../../api/types";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiSend: vi.fn(),
  ws: {
    send: vi.fn(),
    subscribe: vi.fn(),
    onEvent: vi.fn(() => () => {}),
    onStatus: vi.fn(() => () => {}),
  },
}));

vi.mock("../../api/client", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  apiGet: mocks.apiGet,
  apiSend: mocks.apiSend,
}));
vi.mock("../../api/ws", () => ({ ws: mocks.ws }));
vi.mock("./TerminalView", () => ({
  TerminalView: ({ terminalId }: { terminalId: string }) => (
    <div role="application" aria-label={`Terminal ${terminalId}`} />
  ),
}));

import { useTerminalStore } from "./terminalStore";
import { TerminalWorkspace } from "./TerminalWorkspace";

function record(id: string): TerminalRecord {
  return {
    spec: { id, kind: "shell", argv: ["/bin/sh"], cwd: "/tmp", env: {} },
    state: "running",
    pid: 10,
    started_at: null,
    exit_code: null,
    error: null,
  };
}

function visibleTerminalIds(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll('[data-terminal-visible="true"]'),
  ).map((pane) => pane.getAttribute("data-terminal-id") ?? "");
}

beforeEach(() => {
  localStorage.clear();
  mocks.apiGet.mockReset().mockResolvedValue([]);
  mocks.apiSend.mockReset();
  mocks.ws.send.mockReset();
  mocks.ws.subscribe.mockReset();
  mocks.ws.onEvent.mockClear();
  mocks.ws.onStatus.mockClear();
  useTerminalStore.setState({
    records: {},
    lastSequences: {},
    outputChunks: {},
    outputBytes: {},
    visibleAttachments: {},
    connection: "closed",
  });
});

describe("terminal groups", () => {
  it("renders every group session as a tab with its session id", async () => {
    mocks.apiGet.mockResolvedValue([record("t1"), record("t2")]);

    render(<TerminalWorkspace />);

    expect(await screen.findByRole("tab", { name: "t1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "t2" })).toBeInTheDocument();
  });

  it("shows only the selected group's active terminal and keeps the others mounted", async () => {
    localStorage.setItem(
      "cotton-terminal-workspace",
      JSON.stringify({
        version: 1,
        groups: [
          { id: "default", name: "Default", terminalIds: ["t1"] },
          { id: "build", name: "Build", terminalIds: ["t2"] },
        ],
        selectedGroupId: "default",
        activeTerminalByGroup: {},
        minimizedIds: [],
      }),
    );
    mocks.apiGet.mockResolvedValue([record("t1"), record("t2")]);
    const view = render(<TerminalWorkspace />);

    await screen.findByRole("tab", { name: "t1" });
    expect(visibleTerminalIds(view.container)).toEqual(["t1"]);

    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    expect(visibleTerminalIds(view.container)).toEqual(["t2"]);
    expect(view.container.querySelector('[data-terminal-id="t1"]')).not.toBeNull();
  });

  it("keeps a terminal mounted when it moves to another group", async () => {
    mocks.apiGet.mockResolvedValue([record("t1"), record("t2")]);
    const view = render(<TerminalWorkspace />);
    await screen.findByRole("tab", { name: "t1" });
    fireEvent.change(screen.getByLabelText("New group"), {
      target: { value: "Build" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    fireEvent.click(screen.getByRole("button", { name: "Default" }));

    const retained = view.container.querySelector('[data-terminal-id="t1"]');
    const moveSelect = screen.getByLabelText("Move t1 to group") as HTMLSelectElement;
    const destination = Array.from(moveSelect.options).find(
      (option) => option.textContent === "Build",
    )?.value;
    fireEvent.change(moveSelect, {
      target: { value: destination },
    });

    expect(view.container.querySelector('[data-terminal-id="t1"]')).toBe(retained);
    expect(visibleTerminalIds(view.container)).toEqual(["t2"]);

    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    expect(visibleTerminalIds(view.container)).toEqual(["t1"]);
  });

  it("creates a group and puts new terminals in the selected group", async () => {
    mocks.apiSend.mockResolvedValue(record("t1"));
    render(<TerminalWorkspace />);
    fireEvent.change(screen.getByLabelText("New group"), {
      target: { value: "ROS" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    const newShell = screen.getByRole("button", { name: "New shell" });
    await waitFor(() => expect(newShell).toBeEnabled());
    fireEvent.click(newShell);
    expect(await screen.findByRole("tab", { name: "t1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Default" }));
    expect(screen.queryByRole("tab", { name: "t1" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ROS" }));
    expect(screen.getByRole("tab", { name: "t1" })).toBeInTheDocument();
  });

  it("keeps a new terminal in its selected group if state arrives before create returns", async () => {
    let resolveCreate: (value: TerminalRecord) => void = () => {};
    mocks.apiSend.mockReturnValue(
      new Promise<TerminalRecord>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    render(<TerminalWorkspace />);
    fireEvent.change(screen.getByLabelText("New group"), {
      target: { value: "ROS" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    const newShell = screen.getByRole("button", { name: "New shell" });
    await waitFor(() => expect(newShell).toBeEnabled());
    fireEvent.click(newShell);

    act(() => {
      useTerminalStore.getState().applyServerEvent({
        type: "terminal.state",
        data: record("t8"),
      });
    });
    await act(async () => resolveCreate(record("t8")));
    expect(await screen.findByRole("tab", { name: "t8" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Default" }));
    expect(screen.queryByRole("tab", { name: "t8" })).not.toBeInTheDocument();
  });

  it("renames a group", () => {
    render(<TerminalWorkspace />);
    fireEvent.change(screen.getByLabelText("New group"), {
      target: { value: "ROS" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename ROS" }));
    fireEvent.change(screen.getByLabelText("Group name"), {
      target: { value: "Navigation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save group name" }));

    expect(screen.getByRole("button", { name: "Navigation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ROS" })).not.toBeInTheDocument();
  });

  it("moves a terminal to another group", async () => {
    mocks.apiSend.mockResolvedValue(record("t2"));
    render(<TerminalWorkspace />);
    const newShell = screen.getByRole("button", { name: "New shell" });
    await waitFor(() => expect(newShell).toBeEnabled());
    fireEvent.click(newShell);
    await screen.findByRole("tab", { name: "t2" });
    fireEvent.change(screen.getByLabelText("New group"), {
      target: { value: "Build" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    fireEvent.click(screen.getByRole("button", { name: "Default" }));
    const destination = screen.getByRole("option", { name: "Build" }).getAttribute("value");
    fireEvent.change(screen.getByLabelText("Move t2 to group"), {
      target: { value: destination },
    });

    expect(screen.queryByRole("tab", { name: "t2" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Default" }));
    expect(screen.queryByRole("tab", { name: "t2" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(screen.getByRole("tab", { name: "t2" })).toBeInTheDocument();
  });

  it("deletes an empty group", () => {
    render(<TerminalWorkspace />);
    fireEvent.change(screen.getByLabelText("New group"), {
      target: { value: "Temporary" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Temporary" }));

    expect(screen.queryByRole("button", { name: "Temporary" })).not.toBeInTheDocument();
  });

  it("keeps a group usable after all its terminals move away", async () => {
    mocks.apiGet.mockResolvedValue([record("t19")]);
    mocks.apiSend.mockResolvedValue(record("t20"));
    render(<TerminalWorkspace />);
    await screen.findByRole("tab", { name: "t19" });

    fireEvent.change(screen.getByLabelText("New group"), {
      target: { value: "Build" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    fireEvent.click(screen.getByRole("button", { name: "Default" }));
    const moveSelect = screen.getByLabelText("Move t19 to group") as HTMLSelectElement;
    const buildId = Array.from(moveSelect.options).find(
      (option) => option.textContent === "Build",
    )?.value;
    if (!buildId) {
      throw new Error("Build group option is missing");
    }
    fireEvent.change(moveSelect, { target: { value: buildId } });

    const newShell = screen.getByRole("button", { name: "New shell" });
    await waitFor(() => expect(newShell).toBeEnabled());
    fireEvent.click(newShell);
    expect(await screen.findByRole("tab", { name: "t20" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(await screen.findByRole("tab", { name: "t19" })).toBeInTheDocument();
  });

  it("allows the group sidebar to be resized", () => {
    render(<TerminalWorkspace />);

    expect(screen.getByRole("complementary", { name: "Groups" }).className).toContain(
      "resize-x",
    );
  });

  it("rejects deletion of a non-empty group", async () => {
    mocks.apiSend.mockResolvedValue(record("t3"));
    render(<TerminalWorkspace />);
    const newShell = screen.getByRole("button", { name: "New shell" });
    await waitFor(() => expect(newShell).toBeEnabled());
    fireEvent.click(newShell);
    await waitFor(() => expect(screen.getByRole("tab", { name: "t3" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("New group"), {
      target: { value: "Other" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    fireEvent.click(screen.getByRole("button", { name: "Default" }));

    expect(screen.getByRole("button", { name: "Delete Default" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Other" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: "t3" })).toBeInTheDocument();
  });
});
