import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TerminalRecord } from "../../api/types";
import {
  createFakeServer,
  terminalRecord,
  type FakeServerSeed,
} from "../../test/fakeWorkspaceServer";

const mocks = vi.hoisted(() => {
  let statusHandler:
    | ((status: "connecting" | "open" | "closed") => void)
    | undefined;
  return {
    apiGet: vi.fn(),
    apiSend: vi.fn(),
    emitStatus: (status: "connecting" | "open" | "closed") => statusHandler?.(status),
    ws: {
      send: vi.fn(),
      subscribe: vi.fn(),
      onEvent: vi.fn(() => () => {}),
      onStatus: vi.fn(
        (handler: (status: "connecting" | "open" | "closed") => void) => {
          statusHandler = handler;
          return () => {
            statusHandler = undefined;
          };
        },
      ),
    },
  };
});

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
const WORKSPACE_ID = "ws_a";
const DEFAULT_GROUP_ID = "grp_a1";
const BUILD_GROUP_ID = "grp_a2";

function seed(records: TerminalRecord[] = []): FakeServerSeed {
  return {
    workspaces: [
      {
        id: WORKSPACE_ID,
        name: "Alpha",
        groups: [
          { id: DEFAULT_GROUP_ID, name: "Default" },
          { id: BUILD_GROUP_ID, name: "Build" },
        ],
      },
    ],
    records,
    commands: [
      {
        id: "cmd_build",
        workspace_id: WORKSPACE_ID,
        label: "Build",
        body: "colcon build",
        is_startup: false,
        position: 0,
      },
    ],
  };
}

function useServer(options: FakeServerSeed) {
  const server = createFakeServer(options);
  mocks.apiGet.mockImplementation(server.apiGet);
  mocks.apiSend.mockImplementation(server.apiSend);
  return server;
}

beforeEach(() => {
  localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  mocks.apiGet.mockReset();
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
  it("creates a shell in the selected workspace and group", async () => {
    useServer(seed());
    render(<TerminalWorkspace />);

    const newShell = screen.getByRole("button", { name: "New shell" });
    await waitFor(() => expect(newShell).toBeEnabled());
    fireEvent.click(newShell);

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith("POST", "/api/terminals", {
        workspace_id: WORKSPACE_ID,
        group_id: DEFAULT_GROUP_ID,
      }),
    );
    expect(await screen.findByText("Running")).toBeInTheDocument();
    expect(useTerminalStore.getState().records.t1).toBeDefined();
    expect(useTerminalStore.getState().visibleAttachments).toEqual({ t1: true });
  });

  it("creates a command session from the command field", async () => {
    useServer(seed());
    render(<TerminalWorkspace />);
    const runCommand = screen.getByRole("button", { name: "Run command" });
    await waitFor(() => expect(runCommand).toBeEnabled());

    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "echo hello" },
    });
    fireEvent.click(runCommand);

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith("POST", "/api/terminals", {
        workspace_id: WORKSPACE_ID,
        group_id: DEFAULT_GROUP_ID,
        command: "echo hello",
      }),
    );
    expect(await screen.findByRole("button", { name: "Close t1" })).toBeInTheDocument();
  });

  it("only exposes terminal closing through the session close control", async () => {
    useServer(seed([terminalRecord("t8", WORKSPACE_ID, DEFAULT_GROUP_ID)]));
    render(<TerminalWorkspace />);

    await screen.findByRole("button", { name: "Close t8" });

    expect(screen.getAllByRole("button", { name: "Close t8" })).toHaveLength(1);
  });

  it("shows terminal state changes and exit codes", async () => {
    useServer(seed([terminalRecord("t3", WORKSPACE_ID, DEFAULT_GROUP_ID)]));
    render(<TerminalWorkspace />);

    expect(await screen.findByText("Running")).toBeInTheDocument();
    useTerminalStore.getState().applyServerEvent({
      type: "terminal.state",
      data: terminalRecord("t3", WORKSPACE_ID, DEFAULT_GROUP_ID, {
        state: "failed",
        exit_code: 3,
      }),
    });

    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("exit 3")).toBeInTheDocument();
  });

  it("confirms and force-closes a busy terminal", async () => {
    const server = useServer(
      seed([terminalRecord("t4", WORKSPACE_ID, DEFAULT_GROUP_ID)]),
    );
    mocks.apiSend
      .mockRejectedValueOnce(new ApiError("terminal_busy", "busy", 409))
      .mockResolvedValueOnce(
        terminalRecord("t4", WORKSPACE_ID, DEFAULT_GROUP_ID, { state: "exited" }),
      );
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
    expect(server.records).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Close t4" })).not.toBeInTheDocument();
    expect(useTerminalStore.getState().records).not.toHaveProperty("t4");
  });

  it("shows session state under its group in the sidebar", async () => {
    useServer(seed([terminalRecord("t14", WORKSPACE_ID, DEFAULT_GROUP_ID)]));
    render(<TerminalWorkspace />);

    const sidebar = screen.getByRole("complementary", { name: "Groups" });
    expect(await within(sidebar).findByText("Running")).toBeInTheDocument();
    expect(screen.queryByLabelText("Terminal sessions")).not.toBeInTheDocument();
  });

  it("loads saved commands for the selected workspace only", async () => {
    const server = createFakeServer({
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: "Alpha",
          groups: [{ id: DEFAULT_GROUP_ID, name: "Default" }],
        },
        {
          id: "ws_b",
          name: "Beta",
          groups: [{ id: "grp_b1", name: "Default" }],
        },
      ],
      commands: [
        {
          id: "cmd_build",
          workspace_id: WORKSPACE_ID,
          label: "Build",
          body: "colcon build",
          is_startup: false,
          position: 0,
        },
      ],
    });
    mocks.apiGet.mockImplementation(server.apiGet);
    mocks.apiSend.mockImplementation(server.apiSend);
    render(<TerminalWorkspace />);

    expect(await screen.findByRole("button", { name: "Run Build" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("ROS workspace"), {
      target: { value: "ws_b" },
    });

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Run Build" })).not.toBeInTheDocument(),
    );
  });

  it("inserts a saved command into the active terminal without a newline", async () => {
    useServer(seed([terminalRecord("t9", WORKSPACE_ID, DEFAULT_GROUP_ID)]));
    render(<TerminalWorkspace />);

    fireEvent.click(await screen.findByRole("button", { name: "Insert Build" }));

    expect(mocks.ws.send).toHaveBeenCalledWith("terminal.input", {
      id: "t9",
      data: btoa("colcon build"),
    });
  });

  it("runs a saved command and selects the new session", async () => {
    const server = useServer(seed());
    render(<TerminalWorkspace />);

    fireEvent.click(await screen.findByRole("button", { name: "Run Build" }));

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith(
        "POST",
        `/api/workspaces/${WORKSPACE_ID}/commands/cmd_build/run`,
        { group_id: DEFAULT_GROUP_ID },
      ),
    );
    expect(await screen.findByRole("tab", { name: "t1" })).toBeInTheDocument();
    expect(server.records[0].spec.kind).toBe("shell");
  });

  it("keeps sessions from every group attached when switching groups", async () => {
    useServer(
      seed([
        terminalRecord("t15", WORKSPACE_ID, DEFAULT_GROUP_ID),
        terminalRecord("t16", WORKSPACE_ID, BUILD_GROUP_ID),
      ]),
    );
    render(<TerminalWorkspace />);

    await waitFor(() =>
      expect(useTerminalStore.getState().visibleAttachments).toEqual({
        t15: true,
        t16: true,
      }),
    );
    mocks.ws.send.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    expect(mocks.ws.send).not.toHaveBeenCalledWith("terminal.detach", { id: "t15" });
    expect(useTerminalStore.getState().visibleAttachments).toEqual({
      t15: true,
      t16: true,
    });
  });

  it("selects another terminal in a group after its active terminal moves away", async () => {
    useServer(
      seed([
        terminalRecord("t17", WORKSPACE_ID, DEFAULT_GROUP_ID),
        terminalRecord("t18", WORKSPACE_ID, DEFAULT_GROUP_ID),
      ]),
    );
    render(<TerminalWorkspace />);
    await screen.findByRole("tab", { name: "t17" });

    fireEvent.click(screen.getByRole("button", { name: "t17" }));
    fireEvent.change(screen.getByLabelText("Move t17 to group"), {
      target: { value: BUILD_GROUP_ID },
    });
    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith("PATCH", "/api/terminals/t17", {
        group_id: BUILD_GROUP_ID,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Minimize terminal" }));

    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "t18" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Restore t18" })).toBeInTheDocument();
  });

  it("does not prompt before closing an idle shell", async () => {
    useServer(seed([terminalRecord("t5", WORKSPACE_ID, DEFAULT_GROUP_ID)]));
    mocks.apiSend.mockResolvedValue(
      terminalRecord("t5", WORKSPACE_ID, DEFAULT_GROUP_ID, { state: "exited" }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TerminalWorkspace />);

    fireEvent.click((await screen.findAllByRole("button", { name: "Close t5" }))[0]);

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith("DELETE", "/api/terminals/t5"),
    );
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("does not force-close when busy confirmation is cancelled", async () => {
    useServer(seed([terminalRecord("t6", WORKSPACE_ID, DEFAULT_GROUP_ID)]));
    mocks.apiSend.mockRejectedValueOnce(new ApiError("terminal_busy", "busy", 409));
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<TerminalWorkspace />);

    fireEvent.click((await screen.findAllByRole("button", { name: "Close t6" }))[0]);

    await waitFor(() => expect(mocks.apiSend).toHaveBeenCalledTimes(1));
    expect(mocks.apiSend).toHaveBeenCalledWith("DELETE", "/api/terminals/t6");
    expect(useTerminalStore.getState().records.t6.state).toBe("running");
  });

  it("detaches the selected terminal when the workspace unmounts", async () => {
    useServer(seed());
    const view = render(<TerminalWorkspace />);
    const newShell = screen.getByRole("button", { name: "New shell" });
    await waitFor(() => expect(newShell).toBeEnabled());
    fireEvent.click(newShell);
    await screen.findByRole("button", { name: "Close t1" });
    useTerminalStore.getState().setConnection("open");

    view.unmount();

    expect(mocks.ws.send).toHaveBeenLastCalledWith("terminal.detach", { id: "t1" });
  });

  it("minimizes a terminal without terminating its session", async () => {
    useServer(seed([terminalRecord("t9", WORKSPACE_ID, DEFAULT_GROUP_ID)]));
    render(<TerminalWorkspace />);
    await screen.findByRole("tab", { name: "t9" });

    fireEvent.click(screen.getByRole("button", { name: "Minimize terminal" }));

    expect(screen.queryByRole("tab", { name: "t9" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore t9" })).toBeInTheDocument();
    expect(mocks.apiSend).not.toHaveBeenCalledWith("DELETE", "/api/terminals/t9");
  });

  it("restores a minimized terminal with the same session id", async () => {
    useServer(seed([terminalRecord("t10", WORKSPACE_ID, DEFAULT_GROUP_ID)]));
    render(<TerminalWorkspace />);
    await screen.findByRole("tab", { name: "t10" });

    fireEvent.click(screen.getByRole("button", { name: "Minimize terminal" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore t10" }));

    expect(await screen.findByRole("tab", { name: "t10" })).toBeInTheDocument();
    expect(useTerminalStore.getState().records.t10).toBeDefined();
  });

  it("restores the selected group and minimized sessions after reload", async () => {
    localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        selectedWorkspaceId: WORKSPACE_ID,
        selectedGroupId: BUILD_GROUP_ID,
        activeTerminalByGroup: {},
        minimizedIds: ["t11"],
      }),
    );
    useServer(
      seed([
        terminalRecord("t11", WORKSPACE_ID, DEFAULT_GROUP_ID),
        terminalRecord("t12", WORKSPACE_ID, BUILD_GROUP_ID),
      ]),
    );
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

  it("discards a stored state from the previous shape", async () => {
    localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        groups: [{ id: "default", name: "Default", terminalIds: ["t13"] }],
        selectedGroupId: "default",
        activeTerminalByGroup: { default: "t13" },
        minimizedIds: ["t13"],
      }),
    );
    useServer(seed([terminalRecord("t13", WORKSPACE_ID, DEFAULT_GROUP_ID)]));
    render(<TerminalWorkspace />);

    expect(await screen.findByRole("tab", { name: "t13" })).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? "{}") as {
      version?: number;
      groups?: unknown;
      minimizedIds?: string[];
    };
    expect(saved.version).toBe(2);
    expect(saved.groups).toBeUndefined();
    expect(saved.minimizedIds).toEqual([]);
  });

  it("lists the workspaces and shows only the selected one's terminals", async () => {
    const server = createFakeServer({
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: "Alpha",
          groups: [{ id: DEFAULT_GROUP_ID, name: "Default" }],
        },
        {
          id: "ws_b",
          name: "Beta",
          groups: [{ id: "grp_b1", name: "Default" }],
        },
      ],
      records: [
        terminalRecord("t1", WORKSPACE_ID, DEFAULT_GROUP_ID),
        terminalRecord("t2", "ws_b", "grp_b1"),
      ],
    });
    mocks.apiGet.mockImplementation(server.apiGet);
    mocks.apiSend.mockImplementation(server.apiSend);
    render(<TerminalWorkspace />);

    const select = screen.getByLabelText("ROS workspace") as HTMLSelectElement;
    await waitFor(() =>
      expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
        "Alpha",
        "Beta",
      ]),
    );
    expect(await screen.findByRole("tab", { name: "t1" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "t2" })).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: "ws_b" } });

    expect(await screen.findByRole("tab", { name: "t2" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "t1" })).not.toBeInTheDocument();
  });

  it("adds a workspace from the header form", async () => {
    const server = useServer(seed());
    render(<TerminalWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "New shell" })).toBeEnabled(),
    );

    fireEvent.change(screen.getByLabelText("Workspace name"), {
      target: { value: "Beta" },
    });
    fireEvent.change(screen.getByLabelText("Workspace path"), {
      target: { value: "/tmp/beta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add workspace" }));

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith("POST", "/api/workspaces", {
        name: "Beta",
        path: "/tmp/beta",
      }),
    );
    expect(server.workspaces.map((workspace) => workspace.name)).toEqual([
      "Alpha",
      "Beta",
    ]);
    const select = screen.getByLabelText("ROS workspace") as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("ws1"));
  });

  it("deletes the selected workspace", async () => {
    useServer(seed());
    render(<TerminalWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "New shell" })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith(
        "DELETE",
        `/api/workspaces/${WORKSPACE_ID}`,
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "New shell" })).toBeDisabled(),
    );
  });

  it("disables session creation while no workspace exists", async () => {
    useServer({ workspaces: [] });
    render(<TerminalWorkspace />);

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith("/api/terminals"));
    expect(screen.getByRole("button", { name: "New shell" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run command" })).toBeDisabled();
  });

  it("attaches restored sessions after reconciling them with the backend", async () => {
    let resolveTerminals!: (records: TerminalRecord[]) => void;
    const server = createFakeServer(
      seed([terminalRecord("t13", WORKSPACE_ID, DEFAULT_GROUP_ID)]),
    );
    mocks.apiGet.mockImplementation((path: string) =>
      path === "/api/terminals"
        ? new Promise<TerminalRecord[]>((resolve) => {
            resolveTerminals = resolve;
          })
        : server.apiGet(path),
    );
    render(<TerminalWorkspace />);

    useTerminalStore.getState().setConnection("open");
    await waitFor(() =>
      expect(mocks.apiGet).toHaveBeenCalledWith("/api/terminals"),
    );

    expect(mocks.ws.send).not.toHaveBeenCalledWith("terminal.attach", {
      id: "t13",
      after_sequence: 0,
    });

    resolveTerminals([terminalRecord("t13", WORKSPACE_ID, DEFAULT_GROUP_ID)]);
    await waitFor(() =>
      expect(mocks.ws.send).toHaveBeenCalledWith("terminal.attach", {
        id: "t13",
        after_sequence: 0,
      }),
    );
  });

  it("drops minimized sessions that the backend no longer reports", async () => {
    localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        selectedWorkspaceId: WORKSPACE_ID,
        selectedGroupId: DEFAULT_GROUP_ID,
        activeTerminalByGroup: {},
        minimizedIds: ["stale"],
      }),
    );
    useServer(seed([terminalRecord("live", WORKSPACE_ID, DEFAULT_GROUP_ID)]));

    render(<TerminalWorkspace />);

    expect(await screen.findByRole("tab", { name: "live" })).toBeInTheDocument();
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? "{}") as {
        minimizedIds: string[];
      };
      expect(saved.minimizedIds).toEqual([]);
    });
  });

  it("reconciles sessions with the backend before reattaching after reconnect", async () => {
    let resolveAfterRestart!: (records: TerminalRecord[]) => void;
    const server = createFakeServer(
      seed([terminalRecord("stale", WORKSPACE_ID, DEFAULT_GROUP_ID)]),
    );
    let call = 0;
    mocks.apiGet.mockImplementation((path: string) => {
      if (path !== "/api/terminals") {
        return server.apiGet(path);
      }
      call += 1;
      if (call === 1) {
        return Promise.resolve([terminalRecord("stale", WORKSPACE_ID, DEFAULT_GROUP_ID)]);
      }
      return new Promise<TerminalRecord[]>((resolve) => {
        resolveAfterRestart = resolve;
      });
    });
    render(<TerminalWorkspace />);
    await screen.findByRole("tab", { name: "stale" });

    mocks.ws.send.mockClear();
    mocks.emitStatus("closed");
    mocks.emitStatus("open");

    await waitFor(() => expect(call).toBe(2));
    expect(mocks.ws.send).not.toHaveBeenCalledWith("terminal.attach", {
      id: "stale",
      after_sequence: 0,
    });

    resolveAfterRestart([]);

    await waitFor(() => {
      expect(screen.queryByRole("tab", { name: "stale" })).not.toBeInTheDocument();
      expect(useTerminalStore.getState().records).not.toHaveProperty("stale");
      expect(useTerminalStore.getState().visibleAttachments).not.toHaveProperty("stale");
    });
    expect(mocks.ws.send).not.toHaveBeenCalledWith("terminal.attach", {
      id: "stale",
      after_sequence: 0,
    });
  });

  it("waits for the initial backend reconciliation before creating sessions", async () => {
    let resolveTerminals!: (records: TerminalRecord[]) => void;
    const server = createFakeServer(seed());
    mocks.apiGet.mockImplementation((path: string) =>
      path === "/api/terminals"
        ? new Promise<TerminalRecord[]>((resolve) => {
            resolveTerminals = resolve;
          })
        : server.apiGet(path),
    );
    render(<TerminalWorkspace />);

    expect(screen.getByRole("button", { name: "New shell" })).toBeDisabled();
    await waitFor(() =>
      expect(mocks.apiGet).toHaveBeenCalledWith("/api/terminals"),
    );

    resolveTerminals([]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "New shell" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Run command" })).toBeEnabled();
    });
  });
});
