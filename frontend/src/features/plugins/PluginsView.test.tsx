import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PluginRecord } from "../../api/types";
import { useStore } from "../../state/store";

const apiGet = vi.hoisted(() => vi.fn());
const apiSend = vi.hoisted(() => vi.fn());
const apiExists = vi.hoisted(() => vi.fn());
vi.mock("../../api/client", () => ({ apiGet, apiSend, apiExists }));

import { PluginsView } from "./PluginsView";

function pluginRecord(overrides: Partial<PluginRecord> = {}): PluginRecord {
  return {
    name: "foxglove",
    state: "stopped",
    error: null,
    manifest: {
      name: "foxglove",
      version: "0.1.0",
      description: "Foxglove bridge with the local Lichtblick viewer",
      processes: [],
      panels: [
        {
          id: "viewer",
          title: "Foxglove",
          type: "iframe",
          url: "http://{hostname}:8000/lichtblick/index.html",
        },
      ],
      permissions: ["process", "network"],
    },
    ...overrides,
  };
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PluginsView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiGet.mockReset();
  apiSend.mockReset();
  apiExists.mockReset();
  apiExists.mockResolvedValue(true);
  useStore.setState({ plugins: {} });
});

describe("PluginsView", () => {
  it("lists permissions, state and error", async () => {
    apiGet.mockResolvedValue([
      pluginRecord({
        state: "error",
        error: "invalid manifest: missing argv",
        manifest: {
          ...pluginRecord().manifest!,
          permissions: ["process", "network"],
        },
      }),
    ]);

    renderView();

    expect(await screen.findByText("invalid manifest: missing argv")).toBeInTheDocument();
    expect(screen.getByText(/process, network/)).toBeInTheDocument();
    expect(screen.getByText("Estado: Error")).toBeInTheDocument();
  });

  it("activates a plugin and opens its panel", async () => {
    const stopped = pluginRecord();
    apiGet.mockResolvedValue([stopped]);
    apiSend.mockResolvedValue(pluginRecord({ state: "active" }));

    renderView();

    fireEvent.click(await screen.findByRole("button", { name: "Activar" }));

    expect(await screen.findByTitle("Foxglove")).toBeInTheDocument();
    expect(apiSend).toHaveBeenCalledWith("POST", "/api/plugins/foxglove/activate");
    expect(useStore.getState().plugins.foxglove.state).toBe("active");
  });

  it("shows the API error when activation fails", async () => {
    apiGet.mockResolvedValue([pluginRecord()]);
    apiSend.mockRejectedValue(new Error("healthcheck failed for tcp://127.0.0.1:8765"));

    renderView();

    fireEvent.click(await screen.findByRole("button", { name: "Activar" }));

    expect(await screen.findByText(/healthcheck failed/)).toBeInTheDocument();
  });

  it("deactivates a plugin and closes its panel", async () => {
    apiGet.mockResolvedValue([pluginRecord({ state: "active" })]);
    apiSend.mockResolvedValue(pluginRecord({ state: "stopped" }));

    renderView();

    fireEvent.click(await screen.findByRole("button", { name: "Abrir panel" }));
    expect(screen.getByTitle("Foxglove")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));

    await waitFor(() => expect(screen.queryByTitle("Foxglove")).not.toBeInTheDocument());
    expect(apiSend).toHaveBeenCalledWith("DELETE", "/api/plugins/foxglove/activate");
  });
});
