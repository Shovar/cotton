import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EnvironmentInfo, ServerEvent } from "./api/types";
import type { ConnectionStatus } from "./api/ws";

const wsMock = vi.hoisted(() => ({
  onEvent: vi.fn(),
  onStatus: vi.fn(),
  subscribe: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
}));

const apiGetMock = vi.hoisted(() => vi.fn());

vi.mock("./api/ws", () => ({ ws: wsMock }));
vi.mock("./api/client", () => ({ apiGet: apiGetMock }));
vi.mock("./layout/Workbench", () => ({ Workbench: () => <div>workbench</div> }));
vi.mock("./layout/StatusBar", () => ({ StatusBar: () => <div>status bar</div> }));

import { App } from "./App";
import { useStore } from "./state/store";

const ENV: EnvironmentInfo = {
  distro: "jazzy",
  domain_id: 0,
  rmw: null,
  workspace: "/ws",
  ros_version: "2",
  app_version: "0.1.0",
};

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  wsMock.onEvent.mockReset();
  wsMock.onStatus.mockReset();
  wsMock.onEvent.mockReturnValue(() => {});
  wsMock.onStatus.mockReturnValue(() => {});
  wsMock.subscribe.mockReset();
  wsMock.connect.mockReset();
  wsMock.close.mockReset();
  apiGetMock.mockReset();
  useStore.setState({
    env: null,
    graph: null,
    processes: {},
    plugins: {},
    rosConnected: false,
    connection: "closed",
  });
});

describe("App", () => {
  it("loads the environment and subscribes to the graph channel", async () => {
    apiGetMock.mockResolvedValue(ENV);

    const { unmount } = renderApp();

    await waitFor(() => expect(useStore.getState().env).toEqual(ENV));
    expect(apiGetMock).toHaveBeenCalledWith("/api/env");
    expect(wsMock.subscribe).toHaveBeenCalledWith(["graph", "plugins"]);
    expect(wsMock.connect).toHaveBeenCalled();

    unmount();
    expect(wsMock.close).toHaveBeenCalled();
  });

  it("routes websocket events and status into the store", () => {
    apiGetMock.mockReturnValue(new Promise(() => {}));
    let onEvent: ((event: ServerEvent) => void) | undefined;
    let onStatus: ((status: ConnectionStatus) => void) | undefined;
    wsMock.onEvent.mockImplementation((handler: (event: ServerEvent) => void) => {
      onEvent = handler;
      return () => {};
    });
    wsMock.onStatus.mockImplementation((handler: (status: ConnectionStatus) => void) => {
      onStatus = handler;
      return () => {};
    });

    renderApp();

    onEvent?.({
      type: "ros.status",
      data: { connected: true, error: null },
    });
    onStatus?.("open");

    expect(useStore.getState().rosConnected).toBe(true);
    expect(useStore.getState().connection).toBe("open");
  });

  it("ignores a missing environment response", () => {
    apiGetMock.mockReturnValue(new Promise(() => {}));

    renderApp();

    expect(useStore.getState().env).toBeNull();
  });
});
