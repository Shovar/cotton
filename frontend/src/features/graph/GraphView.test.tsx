import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
      subscribers: ["/sim/controller"],
    },
  ],
  services: { "/talker/get_parameters": ["rcl_interfaces/srv/GetParameters"] },
  actions: { "/talker/fibonacci": ["action_tutorials_interfaces/action/Fibonacci"] },
  revision: 3,
};

function search(value: string) {
  fireEvent.change(screen.getByRole("searchbox", { name: "Search graph" }), {
    target: { value },
  });
}

describe("GraphView", () => {
  it("draws nodes and topics as connected points", () => {
    render(<GraphView snapshot={SNAPSHOT} />);

    const graph = screen.getByRole("group", { name: "Nodes and topics graph" });
    expect(within(graph).getByRole("button", { name: "/talker" })).toBeInTheDocument();
    expect(within(graph).getByRole("button", { name: "/sim/controller" })).toBeInTheDocument();
    expect(within(graph).getByRole("button", { name: "/chatter" })).toBeInTheDocument();
    expect(within(graph).getByRole("button", { name: "/cmd_vel" })).toBeInTheDocument();
    expect(screen.getByText("Node")).toBeInTheDocument();
    expect(screen.getByText("Topic")).toBeInTheDocument();
  });

  it("filters the graph by search and keeps the neighbours of a match", () => {
    render(<GraphView snapshot={SNAPSHOT} />);

    search("sim");

    expect(screen.getByRole("button", { name: "/sim/controller" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "/cmd_vel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "/talker" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "/chatter" })).not.toBeInTheDocument();

    search("chatter");

    expect(screen.getByRole("button", { name: "/talker" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "/sim/controller" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "/cmd_vel" })).not.toBeInTheDocument();
  });

  it("shows an explicit empty state when nothing matches", () => {
    render(<GraphView snapshot={SNAPSHOT} />);

    search("zzz");

    expect(screen.getByText("No nodes or topics")).toBeInTheDocument();
  });

  it("opens the detail of a topic with no subscribers", () => {
    render(<GraphView snapshot={SNAPSHOT} />);

    fireEvent.click(screen.getByRole("button", { name: "/chatter" }));

    expect(screen.getByRole("region", { name: "Topic /chatter" })).toBeInTheDocument();
    expect(screen.getByText(/std_msgs\/msg\/String/)).toBeInTheDocument();
    expect(screen.getByText("No subscribers")).toBeInTheDocument();
  });

  it("lists services and actions with their types", () => {
    render(<GraphView snapshot={SNAPSHOT} />);

    expect(screen.getByRole("heading", { name: "Services" })).toBeInTheDocument();
    expect(screen.getByText("/talker/get_parameters")).toBeInTheDocument();
    expect(screen.getByText("rcl_interfaces/srv/GetParameters")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Actions" })).toBeInTheDocument();
    expect(screen.getByText("/talker/fibonacci")).toBeInTheDocument();
    expect(screen.getByText("action_tutorials_interfaces/action/Fibonacci")).toBeInTheDocument();
  });

  it("filters services and actions with the same search box", () => {
    render(<GraphView snapshot={SNAPSHOT} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search graph" }), {
      target: { value: "fibonacci" },
    });

    expect(screen.getByText("/talker/fibonacci")).toBeInTheDocument();
    expect(screen.queryByText("/talker/get_parameters")).not.toBeInTheDocument();
    expect(screen.getByText("No services")).toBeInTheDocument();
  });
});
