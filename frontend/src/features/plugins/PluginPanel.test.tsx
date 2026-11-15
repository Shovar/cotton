import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PluginRecord } from "../../api/types";

const apiExists = vi.hoisted(() => vi.fn());
vi.mock("../../api/client", () => ({ apiExists }));

import { PluginPanel } from "./PluginPanel";

const PLUGIN: PluginRecord = {
  name: "foxglove",
  state: "active",
  error: null,
  manifest: {
    name: "foxglove",
    version: "0.1.0",
    description: "viewer",
    processes: [],
    panels: [],
    permissions: [],
  },
};

beforeEach(() => {
  apiExists.mockReset();
  apiExists.mockResolvedValue(true);
});

describe("PluginPanel", () => {
  it("replaces the hostname placeholder with the browser host", () => {
    render(
      <PluginPanel
        plugin={PLUGIN}
        panel={{
          id: "viewer",
          title: "Foxglove",
          type: "iframe",
          url: "http://{hostname}:8000/lichtblick/index.html?layout=default",
        }}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTitle("Foxglove")).toHaveAttribute(
      "src",
      `http://${location.hostname}:8000/lichtblick/index.html?layout=default`,
    );
  });

  it("replaces {host} with host and port for a custom port", () => {
    render(
      <PluginPanel
        plugin={PLUGIN}
        panel={{
          id: "viewer",
          title: "Foxglove",
          type: "iframe",
          url: "http://{host}/lichtblick/index.html",
        }}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTitle("Foxglove")).toHaveAttribute(
      "src",
      `http://${location.host}/lichtblick/index.html`,
    );
  });

  it("shows the fallback when the viewer assets are missing", async () => {
    apiExists.mockResolvedValue(false);

    render(
      <PluginPanel
        plugin={PLUGIN}
        panel={{
          id: "viewer",
          title: "Foxglove",
          type: "iframe",
          url: "/lichtblick/index.html",
        }}
        onClose={() => {}}
      />,
    );

    expect(
      await screen.findByText(/los assets del visor no están disponibles/i),
    ).toBeInTheDocument();
    expect(apiExists).toHaveBeenCalledWith("/lichtblick/index.html");
    expect(screen.queryByTitle("Foxglove")).not.toBeInTheDocument();
  });

  it("explains that a native panel cannot be embedded", () => {
    render(
      <PluginPanel
        plugin={PLUGIN}
        panel={{ id: "native", title: "Nativo", type: "native", url: null }}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText(/no se puede incrustar/i)).toBeInTheDocument();
  });

  it("closes from the dialog button", () => {
    const onClose = vi.fn();

    render(
      <PluginPanel
        plugin={PLUGIN}
        panel={{ id: "viewer", title: "Foxglove", type: "iframe", url: "/lichtblick/index.html" }}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cerrar panel" }));

    expect(onClose).toHaveBeenCalled();
  });
});
