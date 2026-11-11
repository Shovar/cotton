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
  it("shows the state and exit code of a failed process", async () => {
    useStore.setState({
      processes: { p1: record("p1", { state: "failed", exit_code: 3 }) },
    });

    renderView();

    expect(await screen.findByText("failed")).toBeInTheDocument();
    expect(screen.getByText("exit 3")).toBeInTheDocument();
  });

  it("starts a process from the form", async () => {
    apiSend.mockResolvedValue(record("p2"));

    renderView();
    fireEvent.change(screen.getByLabelText("Comando"), { target: { value: "sleep 5" } });
    fireEvent.click(screen.getByRole("button", { name: "Arrancar" }));

    await waitFor(() =>
      expect(apiSend).toHaveBeenCalledWith("POST", "/api/processes", { command: "sleep 5" }),
    );
    expect(useStore.getState().processes.p2).toBeDefined();
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
