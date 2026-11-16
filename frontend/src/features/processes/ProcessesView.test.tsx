import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProcessRecord } from "../../api/types";
import { useStore } from "../../state/store";

const apiGet = vi.hoisted(() => vi.fn());
const apiSend = vi.hoisted(() => vi.fn());
vi.mock("../../api/client", () => ({ apiGet, apiSend }));
vi.mock("../../api/ws", () => ({ ws: { subscribe: vi.fn() } }));

import { ProcessesView } from "./ProcessesView";

function record(id: string, overrides: Partial<ProcessRecord> = {}): ProcessRecord {
  return {
    id,
    spec: { id, argv: ["sleep", "5"], cwd: null, env: {}, plugin: null, autostart: false },
    state: "running",
    pid: 10,
    pgid: 10,
    started_at: "2026-11-06T12:00:00Z",
    exit_code: null,
    error: null,
    recovered: false,
    ...overrides,
  };
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProcessesView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiGet.mockReset();
  apiSend.mockReset();
  apiGet.mockResolvedValue([]);
  useStore.setState({ processes: {}, logs: {} });
});

describe("ProcessesView", () => {
  it("labels a failed process and marks its card", async () => {
    useStore.setState({ processes: { p1: record("p1", { state: "failed", exit_code: 3 }) } });

    renderView();

    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("exit 3")).toBeInTheDocument();
    expect(screen.getByText("p1").closest("li")).toHaveAttribute("data-state", "failed");
  });

  it("labels a running process and marks its card", async () => {
    useStore.setState({ processes: { p1: record("p1") } });

    renderView();

    expect(await screen.findByText("Running")).toBeInTheDocument();
    expect(screen.getByText("p1").closest("li")).toHaveAttribute("data-state", "running");
  });

  it("starts a process from the prompt", async () => {
    apiSend.mockResolvedValue(record("p2"));

    renderView();
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "sleep 5" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() =>
      expect(apiSend).toHaveBeenCalledWith("POST", "/api/processes", { command: "sleep 5" }),
    );
    expect(useStore.getState().processes.p2).toBeDefined();
    expect(screen.getByLabelText("Command")).toHaveValue("");
  });

  it("runs in the selected terminal and clears its logs", async () => {
    useStore.setState({
      processes: { p1: record("p1", { state: "exited", exit_code: 0 }) },
      logs: {
        p1: [
          {
            id: "p1",
            stream: "stdout",
            level: null,
            ts: "2026-11-16T10:00:00Z",
            text: "old",
          },
        ],
      },
    });
    apiSend.mockResolvedValue(record("p1"));

    renderView();
    fireEvent.change(screen.getByLabelText("Terminal"), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "sleep 5" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() =>
      expect(apiSend).toHaveBeenCalledWith("POST", "/api/processes", {
        command: "sleep 5",
        id: "p1",
      }),
    );
    expect(useStore.getState().logs.p1).toBeUndefined();
    expect(screen.getByLabelText("Terminal")).toHaveValue("");
  });

  it("keeps the command when the start fails", async () => {
    useStore.setState({ processes: { p1: record("p1", { state: "exited" }) } });
    apiSend.mockRejectedValue(new Error("process p1 is already active"));

    renderView();
    fireEvent.change(screen.getByLabelText("Terminal"), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "sleep 5" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(await screen.findByText("process p1 is already active")).toBeInTheDocument();
    expect(screen.getByLabelText("Command")).toHaveValue("sleep 5");
  });

  it("offers only finished terminals to reuse", () => {
    useStore.setState({
      processes: { busy: record("busy"), done: record("done", { state: "exited" }) },
    });

    renderView();

    expect(screen.getByRole("option", { name: /done/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /busy/ })).not.toBeInTheDocument();
  });

  it("recalls launched commands with the arrow keys", async () => {
    apiSend.mockResolvedValue(record("p2"));
    renderView();
    const input = screen.getByLabelText("Command");

    for (const value of ["sleep 1", "sleep 2"]) {
      fireEvent.change(input, { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Run" }));
      await waitFor(() => expect(apiSend).toHaveBeenCalled());
      apiSend.mockClear();
    }

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveValue("sleep 2");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveValue("sleep 1");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveValue("sleep 2");
  });

  it("sends the working directory only when it is set", async () => {
    apiSend.mockResolvedValue(record("p3"));

    renderView();
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "sleep 5" } });
    fireEvent.change(screen.getByLabelText("Working directory"), { target: { value: "/ws" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() =>
      expect(apiSend).toHaveBeenCalledWith("POST", "/api/processes", {
        command: "sleep 5",
        cwd: "/ws",
      }),
    );
  });

  it("ignores an empty command", () => {
    renderView();
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(apiSend).not.toHaveBeenCalled();
  });

  it("asks for confirmation before stopping a running process", async () => {
    useStore.setState({ processes: { p1: record("p1") } });
    apiSend.mockResolvedValue(record("p1", { state: "exited", exit_code: 0 }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));

    await waitFor(() =>
      expect(apiSend).toHaveBeenCalledWith("DELETE", "/api/processes/p1"),
    );
    expect(confirm).toHaveBeenCalled();
  });

  it("opens the logs of the selected process", async () => {
    useStore.setState({ processes: { p1: record("p1") } });

    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Logs" }));

    expect(screen.getByRole("region", { name: "Logs de p1" })).toBeInTheDocument();
  });
});
