import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DockviewApi } from "dockview-react";
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
import { TerminalGroupLayout } from "./TerminalGroup";
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

async function renderDockedTerminals(ids: string[]) {
  for (const id of ids) {
    useTerminalStore.getState().applyServerEvent({ type: "terminal.state", data: record(id) });
  }
  const dockApi: { current: DockviewApi | null } = { current: null };
  render(
    <div style={{ height: 600, position: "relative", width: 900 }}>
      <TerminalGroupLayout
        groupId="test-group"
        terminalIds={ids}
        isActive
        initialLayout={null}
        onActivePanelChange={() => {}}
        onApi={(_groupId, api) => {
          dockApi.current = api;
        }}
        onLayoutChange={() => {}}
      />
    </div>,
  );
  await waitFor(() => expect(dockApi.current?.totalPanels).toBe(ids.length));
  if (!dockApi.current) {
    throw new Error("Dockview API was not initialized");
  }
  return dockApi.current;
}

function splitWidths(api: DockviewApi): number[] {
  const root = api.toJSON().grid.root;
  if (root.type !== "branch" || !Array.isArray(root.data)) {
    throw new Error("Expected terminal panes to be split");
  }
  return root.data.map((pane) => pane.size ?? 0);
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
  it("renders every group session as a dock panel with its session id", async () => {
    mocks.apiGet.mockResolvedValue([record("t1"), record("t2")]);

    render(<TerminalWorkspace />);

    expect(await screen.findByRole("tab", { name: "t1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "t2" })).toBeInTheDocument();
  });

  it("creates a group and puts new terminals in the selected group", async () => {
    mocks.apiSend.mockResolvedValue(record("t1"));
    render(<TerminalWorkspace />);
    fireEvent.change(screen.getByLabelText("New group"), {
      target: { value: "ROS" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create group" }));

    fireEvent.click(screen.getByRole("button", { name: "New shell" }));
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
    fireEvent.click(screen.getByRole("button", { name: "New shell" }));

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

  it("splits a dock tab at its edge without changing the session id", async () => {
    const api = await renderDockedTerminals(["t1", "t2"]);
    api.layout(900, 600, true);

    act(() => {
      api.getPanel("t2")!.api.moveTo({
        group: api.getPanel("t1")!.group,
        position: "right",
      });
    });

    expect(api.groups).toHaveLength(2);
    expect(api.getPanel("t1")?.id).toBe("t1");
    expect(api.getPanel("t2")?.id).toBe("t2");
    expect(api.getPanel("t1")?.group.id).not.toBe(api.getPanel("t2")?.group.id);
  });

  it("keeps tabs and tiled terminals in the same group layout", async () => {
    const api = await renderDockedTerminals(["t1", "t2", "t3"]);
    api.layout(900, 600, true);

    act(() => {
      api.getPanel("t3")!.api.moveTo({
        group: api.getPanel("t1")!.group,
        position: "right",
      });
    });

    expect(api.groups).toHaveLength(2);
    expect(api.getPanel("t1")?.group.id).toBe(api.getPanel("t2")?.group.id);
    expect(api.getPanel("t3")?.group.id).not.toBe(api.getPanel("t1")?.group.id);
    expect(api.panels.map((panel) => panel.id).sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("resizes a tiled pane and gives the neighboring pane the remaining space", async () => {
    const api = await renderDockedTerminals(["t1", "t2"]);
    api.layout(900, 600, true);
    act(() => {
      api.getPanel("t2")!.api.moveTo({
        group: api.getPanel("t1")!.group,
        position: "right",
      });
    });

    const right = api.getPanel("t2")!.group;
    const [leftBefore, rightBefore] = splitWidths(api);
    act(() => right.api.setSize({ width: 600 }));
    const [leftAfter, rightAfter] = splitWidths(api);

    expect(rightAfter).toBeGreaterThan(rightBefore);
    expect(leftAfter).toBeLessThan(leftBefore);
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
    expect(screen.getByRole("tab", { name: "t3" })).toBeInTheDocument();
  });
});
