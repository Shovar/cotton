import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("./TerminalView", () => ({ TerminalView: () => null }));

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

beforeEach(() => {
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
  it("creates a group and puts new terminals in the selected group", async () => {
    mocks.apiSend.mockResolvedValue(record("t1"));
    render(<TerminalWorkspace />);
    fireEvent.change(screen.getByLabelText("New group"), {
      target: { value: "ROS" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    fireEvent.click(screen.getByRole("button", { name: "New shell" }));
    expect(await screen.findByText("t1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Default" }));
    expect(screen.queryByText("t1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ROS" }));
    expect(screen.getByText("t1")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "New shell" }));

    act(() => {
      useTerminalStore.getState().applyServerEvent({
        type: "terminal.state",
        data: record("t8"),
      });
    });
    await act(async () => resolveCreate(record("t8")));
    expect(await screen.findByText("t8")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Default" }));
    expect(screen.queryByText("t8")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "New shell" }));
    await screen.findByText("t2");
    fireEvent.change(screen.getByLabelText("New group"), {
      target: { value: "Build" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    fireEvent.click(screen.getByRole("button", { name: "Default" }));
    const destination = screen.getByRole("option", { name: "Build" }).getAttribute("value");
    fireEvent.change(screen.getByLabelText("Move t2 to group"), {
      target: { value: destination },
    });

    expect(screen.queryByText("t2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Default" }));
    expect(screen.queryByText("t2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(screen.getByText("t2")).toBeInTheDocument();
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

  it("rejects deletion of a non-empty group", async () => {
    mocks.apiSend.mockResolvedValue(record("t3"));
    render(<TerminalWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "New shell" }));
    await waitFor(() => expect(screen.getByText("t3")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("New group"), {
      target: { value: "Other" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    fireEvent.click(screen.getByRole("button", { name: "Default" }));

    expect(screen.getByRole("button", { name: "Delete Default" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Other" })).toBeEnabled();
    expect(screen.getByText("t3")).toBeInTheDocument();
  });
});
