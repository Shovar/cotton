import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

import { ApiError } from "../../api/client";
import { useTerminalStore } from "./terminalStore";
import { TerminalWorkspace } from "./TerminalWorkspace";

const WORKSPACE_STORAGE_KEY = "cotton-terminal-workspace";

function record(
  id: string,
  kind: "shell" | "command" = "shell",
  overrides: Partial<TerminalRecord> = {},
): TerminalRecord {
  return {
    spec: { id, kind, argv: kind === "shell" ? ["/bin/sh"] : ["echo", "hello"], cwd: "/tmp", env: {} },
    state: "running",
    pid: 10,
    started_at: null,
    exit_code: null,
    error: null,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.removeItem(WORKSPACE_STORAGE_KEY);
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

describe("TerminalWorkspace", () => {
  it("creates and selects a default shell", async () => {
    mocks.apiSend.mockResolvedValue(record("t1"));
    render(<TerminalWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "New shell" }));

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith("POST", "/api/terminals", {}),
    );
    expect(await screen.findByText("Running")).toBeInTheDocument();
    expect(useTerminalStore.getState().records.t1).toBeDefined();
    expect(useTerminalStore.getState().visibleAttachments).toEqual({ t1: true });
  });

  it("creates a command session from the command field", async () => {
    mocks.apiSend.mockResolvedValue(record("t2", "command"));
    render(<TerminalWorkspace />);

    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "echo hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run command" }));

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith("POST", "/api/terminals", {
        command: "echo hello",
      }),
    );
    expect(await screen.findByRole("button", { name: "Close t2" })).toBeInTheDocument();
  });

  it("only exposes terminal closing through the session close control", async () => {
    mocks.apiGet.mockResolvedValue([record("t8")]);
    render(<TerminalWorkspace />);

    await screen.findByRole("button", { name: "Close t8" });

    expect(screen.getAllByRole("button", { name: "Close t8" })).toHaveLength(1);
  });

  it("shows terminal state changes and exit codes", async () => {
    mocks.apiGet.mockResolvedValue([record("t3", "command")]);
    render(<TerminalWorkspace />);

    expect(await screen.findByText("Running")).toBeInTheDocument();
    useTerminalStore.getState().applyServerEvent({
      type: "terminal.state",
      data: record("t3", "command", { state: "failed", exit_code: 3 }),
    });

    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("exit 3")).toBeInTheDocument();
  });

  it("confirms and force-closes a busy terminal", async () => {
    mocks.apiGet.mockResolvedValue([record("t4", "command")]);
    mocks.apiSend
      .mockRejectedValueOnce(new ApiError("terminal_busy", "busy", 409))
      .mockResolvedValueOnce(record("t4", "command", { state: "exited", exit_code: 0 }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TerminalWorkspace />);

    fireEvent.click((await screen.findAllByRole("button", { name: "Close t4" }))[0]);

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenLastCalledWith(
        "DELETE",
        "/api/terminals/t4?force=true",
      ),
    );
    expect(window.confirm).toHaveBeenCalled();
    expect(await screen.findByText("Exited")).toBeInTheDocument();
  });

  it("does not prompt before closing an idle shell", async () => {
    mocks.apiGet.mockResolvedValue([record("t5")]);
    mocks.apiSend.mockResolvedValue(record("t5", "shell", { state: "exited" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TerminalWorkspace />);

    fireEvent.click((await screen.findAllByRole("button", { name: "Close t5" }))[0]);

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith("DELETE", "/api/terminals/t5"),
    );
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("does not force-close when busy confirmation is cancelled", async () => {
    mocks.apiGet.mockResolvedValue([record("t6", "command")]);
    mocks.apiSend.mockRejectedValueOnce(new ApiError("terminal_busy", "busy", 409));
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<TerminalWorkspace />);

    fireEvent.click((await screen.findAllByRole("button", { name: "Close t6" }))[0]);

    await waitFor(() => expect(mocks.apiSend).toHaveBeenCalledTimes(1));
    expect(mocks.apiSend).toHaveBeenCalledWith("DELETE", "/api/terminals/t6");
    expect(useTerminalStore.getState().records.t6.state).toBe("running");
  });

  it("detaches the selected terminal when the workspace unmounts", async () => {
    mocks.apiSend.mockResolvedValue(record("t7"));
    const view = render(<TerminalWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "New shell" }));
    await screen.findByRole("button", { name: "Close t7" });
    useTerminalStore.getState().setConnection("open");

    view.unmount();

    expect(mocks.ws.send).toHaveBeenLastCalledWith("terminal.detach", { id: "t7" });
  });

  it("minimizes a terminal without terminating its session", async () => {
    mocks.apiGet.mockResolvedValue([record("t9")]);
    render(<TerminalWorkspace />);
    await screen.findByRole("tab", { name: "t9" });

    fireEvent.click(screen.getByRole("button", { name: "Minimize terminal" }));

    expect(screen.queryByRole("tab", { name: "t9" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore t9" })).toBeInTheDocument();
    expect(mocks.apiSend).not.toHaveBeenCalledWith(
      "DELETE",
      "/api/terminals/t9",
    );
  });

  it("restores a minimized terminal with the same session id", async () => {
    mocks.apiGet.mockResolvedValue([record("t10")]);
    render(<TerminalWorkspace />);
    await screen.findByRole("tab", { name: "t10" });

    fireEvent.click(screen.getByRole("button", { name: "Minimize terminal" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore t10" }));

    expect(await screen.findByRole("tab", { name: "t10" })).toBeInTheDocument();
    expect(useTerminalStore.getState().records.t10).toBeDefined();
  });

  it("restores groups, membership, and selected layout after reload", async () => {
    mocks.apiGet.mockResolvedValue([record("t11"), record("t12")]);
    const firstRender = render(<TerminalWorkspace />);
    await screen.findByRole("tab", { name: "t11" });
    await screen.findByRole("tab", { name: "t12" });

    fireEvent.change(screen.getByLabelText("New group"), {
      target: { value: "Build" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));
    fireEvent.click(screen.getByRole("button", { name: "Default" }));
    const groupSelect = screen.getByLabelText("Move t12 to group") as HTMLSelectElement;
    const buildId = Array.from(groupSelect.options).find(
      (option) => option.textContent === "Build",
    )?.value;
    if (!buildId) {
      throw new Error("Build group option is missing");
    }
    fireEvent.change(screen.getByLabelText("Move t12 to group"), {
      target: { value: buildId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    await screen.findByRole("tab", { name: "t12" });
    fireEvent.click(screen.getByRole("button", { name: "Default" }));
    fireEvent.click(screen.getByRole("button", { name: "Minimize terminal" }));
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    await screen.findByRole("tab", { name: "t12" });
    firstRender.unmount();

    const saved = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? "{}") as {
      groups: Array<{ id: string; name: string; terminalIds: string[] }>;
      selectedGroupId: string;
      minimizedIds: string[];
      dockLayouts: Record<string, { panels: Record<string, unknown> }>;
    };
    expect(saved.groups.find((group) => group.name === "Build")?.terminalIds).toContain("t12");
    expect(saved.groups.find((group) => group.id === saved.selectedGroupId)?.name).toBe("Build");
    expect(saved.minimizedIds).toContain("t11");
    expect(saved.dockLayouts[buildId].panels).toHaveProperty("t12");

    render(<TerminalWorkspace />);

    expect(await screen.findByRole("button", { name: "Build" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await screen.findByRole("tab", { name: "t12" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "t11" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore t11" }));
    expect(await screen.findByRole("tab", { name: "t11" })).toBeInTheDocument();
  });

  it("attaches restored sessions after reconciling them with the backend", async () => {
    localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        groups: [{ id: "default", name: "Default", terminalIds: ["t13"] }],
        selectedGroupId: "default",
        activeTerminalByGroup: { default: "t13" },
        minimizedIds: [],
        dockLayouts: {},
      }),
    );
    let resolveTerminals!: (records: TerminalRecord[]) => void;
    mocks.apiGet.mockReturnValue(
      new Promise<TerminalRecord[]>((resolve) => {
        resolveTerminals = resolve;
      }),
    );
    render(<TerminalWorkspace />);

    useTerminalStore.getState().setConnection("open");

    expect(mocks.ws.send).not.toHaveBeenCalledWith("terminal.attach", {
      id: "t13",
      after_sequence: 0,
    });

    resolveTerminals([record("t13")]);
    await waitFor(() =>
      expect(mocks.ws.send).toHaveBeenCalledWith("terminal.attach", {
        id: "t13",
        after_sequence: 0,
      }),
    );
  });

  it("removes stale sessions from persisted groups and Dockview layouts", async () => {
    mocks.apiGet.mockResolvedValue([record("stale")]);
    const previous = render(<TerminalWorkspace />);
    await screen.findByRole("tab", { name: "stale" });
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? "{}") as {
        dockLayouts: Record<string, { panels: Record<string, unknown> }>;
      };
      expect(saved.dockLayouts.default.panels).toHaveProperty("stale");
    });
    previous.unmount();
    useTerminalStore.setState({
      records: {},
      lastSequences: {},
      outputChunks: {},
      outputBytes: {},
      visibleAttachments: {},
      connection: "closed",
    });
    mocks.apiGet.mockResolvedValue([record("live")]);

    render(<TerminalWorkspace />);

    expect(await screen.findByRole("tab", { name: "live" })).toBeInTheDocument();
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? "{}") as {
        groups: Array<{ terminalIds: string[] }>;
        dockLayouts: Record<string, { panels: Record<string, unknown> }>;
      };
      expect(saved.groups[0].terminalIds).toEqual(["live"]);
      expect(saved.dockLayouts.default.panels).not.toHaveProperty("stale");
      expect(saved.dockLayouts.default.panels).toHaveProperty("live");
    });
    expect(screen.queryByRole("tab", { name: "stale" })).not.toBeInTheDocument();
  });
});
