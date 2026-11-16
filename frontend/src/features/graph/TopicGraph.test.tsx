import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GraphSnapshot } from "../../api/types";
import { TopicGraph } from "./TopicGraph";

const SNAPSHOT: GraphSnapshot = {
  nodes: [
    {
      name: "/listener",
      namespace: "/",
      publishers: [],
      subscribers: ["/chatter"],
      services: [],
      actions: [],
    },
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
      subscribers: ["/listener"],
    },
  ],
  services: {},
  actions: {},
  revision: 3,
};

function draw(overrides: Partial<Parameters<typeof TopicGraph>[0]> = {}) {
  return render(
    <TopicGraph
      snapshot={SNAPSHOT}
      search=""
      selectedNode={null}
      selectedTopic={null}
      onSelectNode={vi.fn()}
      onSelectTopic={vi.fn()}
      {...overrides}
    />,
  );
}

describe("TopicGraph", () => {
  it("draws a node and topic point joined by a directed line", () => {
    const { container } = draw();

    const graph = screen.getByRole("group", { name: "Nodes and topics graph" });
    expect(within(graph).getByRole("button", { name: "/talker" })).toBeInTheDocument();
    expect(within(graph).getByRole("button", { name: "/chatter" })).toBeInTheDocument();

    const lines = container.querySelectorAll("line.graph-link");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveAttribute("marker-end", "url(#topic-graph-arrow)");
  });

  it("opens the detail of the clicked or focused point", () => {
    const onSelectTopic = vi.fn();
    const onSelectNode = vi.fn();
    draw({ onSelectTopic, onSelectNode });

    fireEvent.click(screen.getByRole("button", { name: "/chatter" }));
    expect(onSelectTopic).toHaveBeenCalledWith("/chatter");

    fireEvent.keyDown(screen.getByRole("button", { name: "/talker" }), { key: "Enter" });
    expect(onSelectNode).toHaveBeenCalledWith("/talker");
  });

  it("marks the selected point and shows an explicit empty state", () => {
    const { rerender } = draw({ selectedTopic: "/chatter" });
    expect(screen.getByRole("button", { name: "/chatter" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    rerender(
      <TopicGraph
        snapshot={SNAPSHOT}
        search="zzz"
        selectedNode={null}
        selectedTopic={null}
        onSelectNode={vi.fn()}
        onSelectTopic={vi.fn()}
      />,
    );
    expect(screen.getByText("No nodes or topics")).toBeInTheDocument();
  });
});
