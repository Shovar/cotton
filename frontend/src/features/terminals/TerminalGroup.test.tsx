import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TerminalRecord } from "../../api/types";
import {
  createFakeServer,
  terminalRecord,
  type FakeServerSeed,
} from "../../test/fakeWorkspaceServer";

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
  };
}

function useServer(options: FakeServerSeed) {
  const server = createFakeServer(options);
  mocks.apiGet.mockImplementation(server.apiGet);
  mocks.apiSend.mockImplementation(server.apiSend);
  return server;
}

function visibleTerminalIds(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll('[data-terminal-visible="true"]'),
  ).map((pane) => pane.getAttribute("data-terminal-id") ?? "");
}

beforeEach(() => {
  localStorage.clear();
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

describe("terminal groups", () => {
  it("renders the groups served by the api with their sessions", async () => {
    useServer(seed([terminalRecord("t1", WORKSPACE_ID, DEFAULT_GROUP_ID)]));

    render(<TerminalWorkspace />);

    expect(await screen.findByRole("tab", { name: "t1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Default" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Build" })).toBeInTheDocument();
  });

  it("shows only the selected group's active terminal and keeps the others mounted", async () => {
    useServer(
      seed([
        terminalRecord("t1", WORKSPACE_ID, DEFAULT_GROUP_ID),
        terminalRecord("t2", WORKSPACE_ID, BUILD_GROUP_ID),
      ]),
    );
    const view = render(<TerminalWorkspace />);


    await screen.findByRole("tab", { name: "t1" });
    expect(visibleTerminalIds(view.container)).toEqual(["t1"]);

    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    expect(visibleTerminalIds(view.container)).toEqual(["t2"]);
    expect(view.container.querySelector('[data-terminal-id="t1"]')).not.toBeNull();
  });

  it("keeps a terminal mounted when it moves to another group", async () => {
    useServer(
      seed([
        terminalRecord("t1", WORKSPACE_ID, DEFAULT_GROUP_ID),
        terminalRecord("t2", WORKSPACE_ID, DEFAULT_GROUP_ID),
      ]),
    );
    const view = render(<TerminalWorkspace />);
    await screen.findByRole("tab", { name: "t1" });

    const retained = view.container.querySelector('[data-terminal-id="t1"]');
    const moveSelect = screen.getByLabelText("Move t1 to group") as HTMLSelectElement;
    fireEvent.change(moveSelect, { target: { value: BUILD_GROUP_ID } });

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith("PATCH", "/api/terminals/t1", {
        group_id: BUILD_GROUP_ID,
      }),
    );
    expect(view.container.querySelector('[data-terminal-id="t1"]')).toBe(retained);
    expect(visibleTerminalIds(view.container)).toEqual(["t2"]);

    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    expect(visibleTerminalIds(view.container)).toEqual(["t1"]);
  });

  it("creates a group in the selected workspace and puts new shells in it", async () => {
    const server = useServer(seed());
    render(<TerminalWorkspace />);
    await screen.findByRole("button", { name: "Default" });

    fireEvent.change(screen.getByLabelText("New group"), {
      target: { value: "ROS" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith(
        "POST",
        `/api/workspaces/${WORKSPACE_ID}/groups`,
        { name: "ROS" },
      ),
    );
    const created = server.groups.find((group) => group.name === "ROS");
    expect(created).toBeDefined();

    const newShell = screen.getByRole("button", { name: "New shell" });
    await waitFor(() => expect(newShell).toBeEnabled());
    fireEvent.click(newShell);

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith("POST", "/api/terminals", {
        workspace_id: WORKSPACE_ID,
        group_id: created?.id,
      }),
    );

    const terminalId = server.records[0].spec.id;
    await screen.findByRole("tab", { name: terminalId });
    fireEvent.click(screen.getByRole("button", { name: "Default" }));
    expect(screen.queryByRole("tab", { name: terminalId })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ROS" }));
    expect(screen.getByRole("tab", { name: terminalId })).toBeInTheDocument();
  });

  it("renames a group through the api", async () => {
    useServer(seed());
    render(<TerminalWorkspace />);
    await screen.findByRole("button", { name: "Build" });

    fireEvent.click(screen.getByRole("button", { name: "Rename Build" }));
    fireEvent.change(screen.getByLabelText("Group name"), {
      target: { value: "Navigation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save group name" }));

    expect(
      await screen.findByRole("button", { name: "Navigation" }),
    ).toBeInTheDocument();
    expect(mocks.apiSend).toHaveBeenCalledWith(
      "PATCH",
      `/api/terminal-groups/${BUILD_GROUP_ID}`,
      { name: "Navigation" },
    );
  });

  it("deletes an empty group through the api", async () => {
    useServer(seed());
    render(<TerminalWorkspace />);
    await screen.findByRole("button", { name: "Build" });

    fireEvent.click(screen.getByRole("button", { name: "Delete Build" }));

    await waitFor(() =>
      expect(mocks.apiSend).toHaveBeenCalledWith(
        "DELETE",
        `/api/terminal-groups/${BUILD_GROUP_ID}`,
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Build" })).not.toBeInTheDocument(),
    );
  });

  it("rejects deletion of a non-empty group", async () => {
    useServer(seed([terminalRecord("t3", WORKSPACE_ID, DEFAULT_GROUP_ID)]));
    render(<TerminalWorkspace />);
    await screen.findByRole("tab", { name: "t3" });

    expect(screen.getByRole("button", { name: "Delete Default" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Build" })).toBeEnabled();
  });

  it("allows the group sidebar to be resized", async () => {
    useServer(seed());
    render(<TerminalWorkspace />);
    await screen.findByRole("button", { name: "Default" });

    expect(screen.getByRole("complementary", { name: "Groups" }).className).toContain(
      "resize-x",
    );
  });
});
