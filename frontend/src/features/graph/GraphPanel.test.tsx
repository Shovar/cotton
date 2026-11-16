import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GraphSnapshot } from "../../api/types";
import { clearPanels, getPanel } from "../../layout/panelRegistry";
import { useStore } from "../../state/store";
import { GraphPanel } from "./GraphPanel";
import { registerGraphPanel } from "./register";

const SNAPSHOT: GraphSnapshot = {
  nodes: [
    {
      name: "/talker",
      namespace: "/",
      publishers: ["/chatter"],
      subscribers: [],
      services: [],
      actions: [],
    },
  ],
  topics: [
    {
      name: "/chatter",
      types: ["std_msgs/msg/String"],
      publishers: ["/talker"],
      subscribers: [],
    },
  ],
  services: {},
  actions: {},
  revision: 3,
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GraphPanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  clearPanels();
  useStore.setState({ graph: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/params") ? jsonResponse({}) : jsonResponse(SNAPSHOT),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GraphPanel", () => {
  it("registers the graph panel with the graph view", () => {
    registerGraphPanel();

    expect(getPanel("graph")?.component).toBe(GraphPanel);
  });

  it("waits for the first snapshot", () => {
    renderPanel();

    expect(screen.getByText("Waiting for the graph…")).toBeInTheDocument();
  });

  it("loads the graph over REST and follows websocket updates", async () => {
    renderPanel();
    expect(await screen.findByRole("button", { name: "/chatter" })).toBeInTheDocument();

    act(() => {
      useStore.getState().applyServerEvent({
        type: "graph.update",
        data: {
          ...SNAPSHOT,
          topics: [
            ...SNAPSHOT.topics,
            {
              name: "/odom",
              types: ["nav_msgs/msg/Odometry"],
              publishers: [],
              subscribers: [],
            },
          ],
          revision: 4,
        },
      });
    });

    expect(screen.getByRole("button", { name: "/odom" })).toBeInTheDocument();
  });

  it("opens the parameter editor for a node", async () => {
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "/talker" }));

    expect(
      await screen.findByRole("heading", { name: "Parameters of /talker" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("No parameters")).toBeInTheDocument();
  });
});
