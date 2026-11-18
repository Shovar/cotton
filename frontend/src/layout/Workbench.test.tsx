import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadPreferences, savePreferences } from "../state/preferences";
import type { IDockviewPanelProps } from "dockview-react";

const fake = vi.hoisted(() => {
  interface FakePanel {
    id: string;
    api: { setActive: ReturnType<typeof vi.fn> };
  }

  const panels = new Map<string, FakePanel>();
  let layoutHandler: (() => void) | null = null;
  let activeHandler: ((event: { panel?: { id: string } }) => void) | null = null;

  const api = {
    activePanel: undefined as FakePanel | undefined,
    panels,
    addPanel: vi.fn((options: { id: string; title?: string; component: string }) => {
      const panel: FakePanel = { id: options.id, api: { setActive: vi.fn() } };
      panels.set(options.id, panel);
      return panel;
    }),
    getPanel: vi.fn((id: string) => panels.get(id)),
    fromJSON: vi.fn(),
    toJSON: vi.fn(() => ({ grid: {} })),
    onDidLayoutChange: vi.fn((handler: () => void) => {
      layoutHandler = handler;
      return { dispose: vi.fn() };
    }),
    onDidActivePanelChange: vi.fn(
      (handler: (event: { panel?: { id: string } }) => void) => {
        activeHandler = handler;
        return { dispose: vi.fn() };
      },
    ),
  };

  return {
    api,
    reset() {
      panels.clear();
      layoutHandler = null;
      activeHandler = null;
      api.activePanel = undefined;
      api.addPanel.mockClear();
      api.getPanel.mockClear();
      api.fromJSON.mockClear();
      api.toJSON.mockClear();
      api.onDidLayoutChange.mockClear();
      api.onDidActivePanelChange.mockClear();
    },
    fireLayoutChange() {
      layoutHandler?.();
    },
    fireActivePanel(id: string) {
      activeHandler?.({ panel: { id } });
    },
  };
});

vi.mock("dockview-react", () => ({
  DockviewReact: ({
    onReady,
    components,
  }: {
    onReady: (event: { api: typeof fake.api }) => void;
    components: Record<string, unknown>;
  }) => {
    const ready = useRef(false);
    useEffect(() => {
      if (!ready.current) {
        ready.current = true;
        onReady({ api: fake.api });
      }
    }, [onReady]);
    return (
      <div data-testid="dockview" data-components={Object.keys(components).join(",")} />
    );
  },
}));

import { clearPanels, registerPanel } from "./panelRegistry";
import { registerShellPanels } from "./shellPanels";
import { Workbench } from "./Workbench";

function ProbePanel({ api }: IDockviewPanelProps) {
  return <div>{api.title}</div>;
}

beforeEach(() => {
  fake.reset();
  clearPanels();
  localStorage.clear();
});

describe("Workbench", () => {
  it("shows the Cotton logo in the activity bar", () => {
    render(<Workbench />);

    const logo = screen.getByRole("img", { name: "Cotton" });
    expect(logo).toBeVisible();
    expect(logo).toHaveAttribute("src", "/src/assets/cotton-logo.png");
    expect(logo).toHaveClass("brightness-0", "dark:invert");
  });

  it("opens the three shell sections in the dock", () => {
    registerShellPanels();

    render(<Workbench />);

    expect(fake.api.addPanel).toHaveBeenCalledTimes(3);
    expect(fake.api.addPanel).toHaveBeenNthCalledWith(1, {
      id: "graph",
      component: "graph",
      title: "Graph",
      inactive: false,
    });
    expect(screen.getByTestId("dockview")).toHaveAttribute(
      "data-components",
      "graph,processes,plugins",
    );
    for (const name of ["Graph", "Processes", "Plugins"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("shows a panel registered by a feature without editing Workbench", () => {
    registerPanel({ id: "probe", title: "Prueba", component: ProbePanel });

    render(<Workbench />);

    expect(fake.api.addPanel).toHaveBeenCalledWith({
      id: "probe",
      component: "probe",
      title: "Prueba",
      inactive: false,
    });
    expect(screen.getByRole("button", { name: "Prueba" })).toBeInTheDocument();
  });

  it("restores a saved dock layout", () => {
    const layout = { grid: { root: "saved" } };
    savePreferences({ theme: "light", layout });

    render(<Workbench />);

    expect(fake.api.fromJSON).toHaveBeenCalledWith(layout);
    expect(fake.api.addPanel).not.toHaveBeenCalled();
  });

  it("falls back to the default layout when the saved one is corrupt", () => {
    registerShellPanels();
    savePreferences({ theme: "light", layout: { grid: {} } });
    fake.api.fromJSON.mockImplementationOnce(() => {
      throw new Error("corrupt layout");
    });

    render(<Workbench />);

    expect(fake.api.addPanel).toHaveBeenCalledTimes(3);
  });

  it("activates an open panel from the activity bar", () => {
    registerShellPanels();
    render(<Workbench />);
    fake.api.getPanel.mockClear();
    const panel = fake.api.panels.get("graph");

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    expect(fake.api.getPanel).toHaveBeenCalledWith("graph");
    expect(panel?.api.setActive).toHaveBeenCalled();
  });

  it("opens a registered panel that is not in the dock yet", () => {
    registerShellPanels();
    render(<Workbench />);
    fake.api.panels.delete("plugins");
    fake.api.addPanel.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Plugins" }));

    expect(fake.api.addPanel).toHaveBeenCalledWith({
      id: "plugins",
      component: "plugins",
      title: "Plugins",
    });
  });

  it("persists the layout whenever dockview changes it", () => {
    registerShellPanels();
    render(<Workbench />);

    fake.fireLayoutChange();

    expect(loadPreferences().layout).toEqual({ grid: {} });
  });

  it("tracks the active panel for the activity bar", () => {
    registerShellPanels();
    render(<Workbench />);

    act(() => fake.fireActivePanel("processes"));

    expect(screen.getByRole("button", { name: "Processes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("disposes dockview listeners on unmount", () => {
    registerShellPanels();
    const { unmount } = render(<Workbench />);
    const layoutSubscription = fake.api.onDidLayoutChange.mock.results[0].value;
    const activeSubscription = fake.api.onDidActivePanelChange.mock.results[0].value;

    unmount();

    expect(layoutSubscription.dispose).toHaveBeenCalled();
    expect(activeSubscription.dispose).toHaveBeenCalled();
  });
});
