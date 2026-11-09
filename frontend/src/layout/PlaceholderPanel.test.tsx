import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { IDockviewPanelProps } from "dockview-react";

import { PlaceholderPanel } from "./PlaceholderPanel";

describe("PlaceholderPanel", () => {
  it("labels the empty panel with its dock title", () => {
    render(
      <PlaceholderPanel
        api={{ title: "Grafo" } as IDockviewPanelProps["api"]}
        containerApi={{} as IDockviewPanelProps["containerApi"]}
        params={{}}
      />,
    );

    expect(screen.getByRole("region", { name: "Grafo" })).toBeInTheDocument();
    expect(screen.getByText("Grafo")).toBeInTheDocument();
  });
});
