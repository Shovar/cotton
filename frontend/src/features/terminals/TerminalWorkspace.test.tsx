import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import type { LayoutNode } from "./layout";
import { useTerminalStore } from "./terminalStore";
import { TerminalWorkspace } from "./TerminalWorkspace";

const WORKSPACE_STORAGE_KEY = "cotton-terminal-workspace";
const WORKSPACE_ID = "ws_a";

function seed(records: TerminalRecord[] = []): FakeServerSeed {
  return { workspaces: [{ id: WORKSPACE_ID, name: "Alpha" }], records };
}

function useServer(options: FakeServerSeed) {
  const server = createFakeServer(options);
  mocks.apiGet.mockImplementation(server.apiGet);
  mocks.apiSend.mockImplementation(server.apiSend);
  return server;
}

function dockEdge(container: HTMLElement, side: string): HTMLElement {
  const edge = container.querySelector(`[data-dock-side="${side}"]`);
  if (!(edge instanceof HTMLElement)) {
    throw new Error(`Missing dock edge ${side}`);
  }
  return edge;
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
  it("creates a shell in the selected workspace", async () => {
    const server = useServer(seed());
    render(<TerminalWorkspace />);

    const newShell = screen.getByRole("button", { name: "New shell" });
    await waitFor(() => expect(newShell).toBeEnabled());
    fireEvent.click(newShell);

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith("POST", "/api/terminals", {
        workspace_id: WORKSPACE_ID,
      }),
    );
    const terminalId = server.records[0].spec.id;
    expect(await screen.findByRole("tab", { name: terminalId })).toBeInTheDocument();
    await waitFor(() =>
      expect(useTerminalStore.getState().visibleAttachments).toEqual({
        [terminalId]: true,
      }),
    );
  });

  it("shows only the selected workspace's terminals", async () => {
    const server = createFakeServer({
      workspaces: [
        { id: WORKSPACE_ID, name: "Alpha" },
        { id: "ws_b", name: "Beta" },
      ],
      records: [terminalRecord("t1", WORKSPACE_ID), terminalRecord("t2", "ws_b")],
    });
    mocks.apiGet.mockImplementation(server.apiGet);
    mocks.apiSend.mockImplementation(server.apiSend);
    render(<TerminalWorkspace />);

    expect(await screen.findByRole("tab", { name: "t1" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "t2" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Beta" }));

    expect(await screen.findByRole("tab", { name: "t2" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "t1" })).not.toBeInTheDocument();
  });

  it("shows terminal state changes and exit codes", async () => {
    useServer(seed([terminalRecord("t3", WORKSPACE_ID)]));
    render(<TerminalWorkspace />);

    expect(await screen.findByText("Running")).toBeInTheDocument();
    useTerminalStore.getState().applyServerEvent({
      type: "terminal.state",
      data: terminalRecord("t3", WORKSPACE_ID, { state: "failed", exit_code: 3 }),
    });

    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("exit 3")).toBeInTheDocument();
  });

  it("confirms and force-closes a busy terminal", async () => {
    useServer(seed([terminalRecord("t4", WORKSPACE_ID)]));
    mocks.apiSend
      .mockRejectedValueOnce(new ApiError("terminal_busy", "busy", 409))
      .mockResolvedValueOnce(
        terminalRecord("t4", WORKSPACE_ID, { state: "exited" }),
      );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TerminalWorkspace />);

    fireEvent.click(await screen.findByRole("button", { name: "Close t4" }));

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenLastCalledWith(
        "DELETE",
        "/api/terminals/t4?force=true",
      ),
    );
    expect(window.confirm).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Close t4" })).not.toBeInTheDocument();
    expect(useTerminalStore.getState().records).not.toHaveProperty("t4");
  });

  it("does not prompt before closing an idle shell", async () => {
    useServer(seed([terminalRecord("t5", WORKSPACE_ID)]));
    mocks.apiSend.mockResolvedValue(
      terminalRecord("t5", WORKSPACE_ID, { state: "exited" }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TerminalWorkspace />);

    fireEvent.click(await screen.findByRole("button", { name: "Close t5" }));

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith("DELETE", "/api/terminals/t5"),
    );
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("does not force-close when busy confirmation is cancelled", async () => {
    useServer(seed([terminalRecord("t6", WORKSPACE_ID)]));
    mocks.apiSend.mockRejectedValueOnce(new ApiError("terminal_busy", "busy", 409));
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<TerminalWorkspace />);

    fireEvent.click(await screen.findByRole("button", { name: "Close t6" }));

    await waitFor(() => expect(mocks.apiSend).toHaveBeenCalledTimes(1));
    expect(mocks.apiSend).toHaveBeenCalledWith("DELETE", "/api/terminals/t6");
    expect(useTerminalStore.getState().records.t6.state).toBe("running");
  });

  it("minimizes a terminal without terminating its session", async () => {
    useServer(seed([terminalRecord("t9", WORKSPACE_ID)]));
    render(<TerminalWorkspace />);
    await screen.findByRole("tab", { name: "t9" });

    fireEvent.click(screen.getByRole("button", { name: "Minimize terminal" }));

    expect(screen.queryByRole("tab", { name: "t9" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore t9" })).toBeInTheDocument();
    expect(mocks.apiSend).not.toHaveBeenCalledWith("DELETE", "/api/terminals/t9");
  });

  it("restores a minimized terminal with the same session id", async () => {
    useServer(seed([terminalRecord("t10", WORKSPACE_ID)]));
    render(<TerminalWorkspace />);
    await screen.findByRole("tab", { name: "t10" });

    fireEvent.click(screen.getByRole("button", { name: "Minimize terminal" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore t10" }));

    expect(await screen.findByRole("tab", { name: "t10" })).toBeInTheDocument();
    expect(useTerminalStore.getState().records.t10).toBeDefined();
  });

  it("restores the selected workspace and minimized sessions after reload", async () => {
    localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: 4,
        selectedWorkspaceId: "ws_b",
        activeTerminalId: "t12",
        minimizedIds: ["t11"],
      }),
    );
    const server = createFakeServer({
      workspaces: [
        { id: WORKSPACE_ID, name: "Alpha" },
        { id: "ws_b", name: "Beta" },
      ],
      records: [
        terminalRecord("t11", "ws_b"),
        terminalRecord("t12", "ws_b"),
      ],
    });
    mocks.apiGet.mockImplementation(server.apiGet);
    render(<TerminalWorkspace />);

    expect(await screen.findByRole("button", { name: "Beta" })).toHaveAttribute(
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
        version: 2,
        selectedWorkspaceId: WORKSPACE_ID,
        selectedGroupId: "grp_a1",
        activeTerminalByGroup: {},
        minimizedIds: ["t13"],
      }),
    );
    useServer(seed([terminalRecord("t13", WORKSPACE_ID)]));
    render(<TerminalWorkspace />);

    expect(await screen.findByRole("tab", { name: "t13" })).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? "{}") as {
      version?: number;
      selectedGroupId?: unknown;
      minimizedIds?: string[];
    };
    expect(saved.version).toBe(4);
    expect(saved.selectedGroupId).toBeUndefined();
    expect(saved.minimizedIds).toEqual([]);
  });

  it("disables session creation while no workspace exists", async () => {
    useServer({ workspaces: [] });
    render(<TerminalWorkspace />);

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith("/api/terminals"));
    expect(screen.getByRole("button", { name: "New shell" })).toBeDisabled();
  });

  it("adds a workspace from the folder dialog", async () => {
    const server = useServer(seed());
    mocks.apiGet.mockImplementation((path: string) =>
      path.startsWith("/api/folders")
        ? Promise.resolve({
            path: "/home/me/colcon_ws",
            parent: "/home/me",
            folders: [],
          })
        : server.apiGet(path),
    );
    render(<TerminalWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "New shell" })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "New workspace" }));
    await screen.findByText("/home/me/colcon_ws");
    fireEvent.click(screen.getByRole("button", { name: "Add colcon_ws" }));

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith("POST", "/api/workspaces", {
        name: "colcon_ws",
        path: "/home/me/colcon_ws",
      }),
    );
    expect(
      await screen.findByRole("button", { name: "colcon_ws" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("deletes the selected workspace", async () => {
    useServer(seed());
    render(<TerminalWorkspace />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "New shell" })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Alpha" }));

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

  it("docks a dragged terminal on a side and back into the tab bar", async () => {
    useServer(
      seed([terminalRecord("t1", WORKSPACE_ID), terminalRecord("t2", WORKSPACE_ID)]),
    );
    const { container } = render(<TerminalWorkspace />);
    await screen.findByRole("tab", { name: "t1" });
    const dataTransfer = { setData: vi.fn(), effectAllowed: "move" } as unknown as DataTransfer;
    const shape = (node: LayoutNode): unknown =>
      node.type === "pane"
        ? node.tabs
        : { [node.direction]: node.children.map(shape), sizes: node.sizes };
    const visiblePanes = () =>
      container.querySelectorAll('[data-terminal-visible="true"]').length;
    const savedLayout = () =>
      shape(
        (
          JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? "{}") as {
            panes: Record<string, LayoutNode>;
          }
        ).panes[WORKSPACE_ID],
      );

    fireEvent.dragStart(screen.getByRole("tab", { name: "t2" }), { dataTransfer });
    fireEvent.drop(dockEdge(container, "right"));

    await waitFor(() => expect(visiblePanes()).toBe(2));
    await waitFor(() =>
      expect(savedLayout()).toEqual({ row: [["t1"], ["t2"]], sizes: [1, 1] }),
    );

    fireEvent.dragStart(screen.getByRole("tab", { name: "t2" }), { dataTransfer });
    fireEvent.drop(screen.getAllByRole("tablist")[0]);

    await waitFor(() => expect(visiblePanes()).toBe(1));
    await waitFor(() => expect(savedLayout()).toEqual(["t1", "t2"]));
  });

  it("attaches restored sessions after reconciling them with the backend", async () => {
    let resolveTerminals!: (records: TerminalRecord[]) => void;
    const server = createFakeServer(seed([terminalRecord("t13", WORKSPACE_ID)]));
    mocks.apiGet.mockImplementation((path: string) =>
      path === "/api/terminals"
        ? new Promise<TerminalRecord[]>((resolve) => {
            resolveTerminals = resolve;
          })
        : server.apiGet(path),
    );
    render(<TerminalWorkspace />);

    useTerminalStore.getState().setConnection("open");
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith("/api/terminals"));

    expect(mocks.ws.send).not.toHaveBeenCalledWith("terminal.attach", {
      id: "t13",
      after_sequence: 0,
    });

    resolveTerminals([terminalRecord("t13", WORKSPACE_ID)]);
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
        version: 4,
        selectedWorkspaceId: WORKSPACE_ID,
        activeTerminalId: null,
        minimizedIds: ["stale"],
      }),
    );
    useServer(seed([terminalRecord("live", WORKSPACE_ID)]));

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
    const server = createFakeServer(seed([terminalRecord("stale", WORKSPACE_ID)]));
    let call = 0;
    mocks.apiGet.mockImplementation((path: string) => {
      if (path !== "/api/terminals") {
        return server.apiGet(path);
      }
      call += 1;
      if (call === 1) {
        return Promise.resolve([terminalRecord("stale", WORKSPACE_ID)]);
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
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith("/api/terminals"));

    resolveTerminals([]);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "New shell" })).toBeEnabled(),
    );
  });

  it("detaches the visible terminals when the workspace unmounts", async () => {
    const server = useServer(seed());
    const view = render(<TerminalWorkspace />);
    const newShell = screen.getByRole("button", { name: "New shell" });
    await waitFor(() => expect(newShell).toBeEnabled());
    fireEvent.click(newShell);
    const terminalId = server.records[0].spec.id;
    await screen.findByRole("tab", { name: terminalId });
    useTerminalStore.getState().setConnection("open");

    view.unmount();

    expect(mocks.ws.send).toHaveBeenLastCalledWith("terminal.detach", {
      id: terminalId,
    });
  });
});
