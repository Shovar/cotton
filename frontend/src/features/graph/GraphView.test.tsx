import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GraphSnapshot } from "../../api/types";
import { GraphView } from "./GraphView";

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
    {
      name: "/sim/controller",
      namespace: "/sim",
      publishers: ["/cmd_vel"],
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
    {
      name: "/cmd_vel",
      types: ["geometry_msgs/msg/Twist"],
      publishers: ["/sim/controller"],
      subscribers: [],
    },
    {
      name: "/rosout",
      types: ["rcl_interfaces/msg/Log"],
      publishers: ["/talker", "/sim/controller"],
      subscribers: [],
    },
  ],
  services: { "/talker/get_parameters": ["rcl_interfaces/srv/GetParameters"] },
  actions: { "/talker/fibonacci": ["action_tutorials_interfaces/action/Fibonacci"] },
  revision: 3,
};

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GraphView snapshot={SNAPSHOT} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function search(value: string) {
  fireEvent.change(screen.getByRole("searchbox", { name: "Search graph" }), {
    target: { value },
  });
}

describe("GraphView", () => {
  it("draws nodes and topics as connected points", () => {
    renderView();

    const graph = screen.getByRole("group", { name: "Nodes and topics graph" });
    expect(within(graph).getByRole("button", { name: "/talker" })).toBeInTheDocument();
    expect(within(graph).getByRole("button", { name: "/sim/controller" })).toBeInTheDocument();
    expect(within(graph).getByRole("button", { name: "/chatter" })).toBeInTheDocument();
    expect(within(graph).getByRole("button", { name: "/cmd_vel" })).toBeInTheDocument();
    expect(screen.getByText("Node")).toBeInTheDocument();
    expect(screen.getByText("Topic")).toBeInTheDocument();
    expect(screen.getByText("Service")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("filters the graph by search and keeps the neighbours of a match", () => {
    renderView();

    search("sim");

    expect(screen.getByRole("button", { name: "/sim/controller" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "/cmd_vel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "/talker" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "/chatter" })).not.toBeInTheDocument();

    search("chatter");

    expect(screen.getByRole("button", { name: "/talker" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "/sim/controller" })).not.toBeInTheDocument();
  });

  it("shows an explicit empty state when nothing matches", () => {
    renderView();

    search("zzz");

    expect(screen.getByText("No nodes or topics")).toBeInTheDocument();
  });

  it("keeps the noisy topics out of the graph", () => {
    renderView();

    search("/rosout");

    expect(screen.getByText("No nodes or topics")).toBeInTheDocument();
  });

  it("keeps every point visible when one is selected", () => {
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "/talker" }));

    expect(screen.getByRole("button", { name: "/talker" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "/chatter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "/sim/controller" })).toBeInTheDocument();
  });

  it("opens the detail of a topic with no subscribers", () => {
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "/chatter" }));

    expect(screen.getByRole("region", { name: "Topic /chatter" })).toBeInTheDocument();
    expect(screen.getByText(/std_msgs\/msg\/String/)).toBeInTheDocument();
    expect(screen.getByText("No subscribers")).toBeInTheDocument();
  });

  it("lists services and actions with their types", () => {
    renderView();

    expect(screen.getByRole("heading", { name: "Services" })).toBeInTheDocument();
    expect(screen.getByText("/talker/get_parameters")).toBeInTheDocument();
    expect(screen.getByText("rcl_interfaces/srv/GetParameters")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Actions" })).toBeInTheDocument();
    expect(screen.getByText("/talker/fibonacci")).toBeInTheDocument();
    expect(screen.getByText("action_tutorials_interfaces/action/Fibonacci")).toBeInTheDocument();
  });

  it("filters services and actions with the same search box", () => {
    renderView();

    search("fibonacci");

    expect(screen.getByText("/talker/fibonacci")).toBeInTheDocument();
    expect(screen.queryByText("/talker/get_parameters")).not.toBeInTheDocument();
    expect(screen.getByText("No services")).toBeInTheDocument();
  });
});
