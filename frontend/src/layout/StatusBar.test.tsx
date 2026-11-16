import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import type { ProcessRecord } from "../api/types";
import { loadPreferences } from "../state/preferences";
import { useStore } from "../state/store";
import { StatusBar } from "./StatusBar";

const ENV = {
  distro: "jazzy",
  domain_id: 0,
  rmw: null,
  workspace: "/ws",
  ros_version: "2",
  app_version: "0.1.0",
};

function processRecord(id: string, state: ProcessRecord["state"]): ProcessRecord {
  return {
    id,
    spec: { id, argv: ["ros2", "run"], cwd: null, env: {}, plugin: null, autostart: false },
    state,
    pid: null,
    pgid: null,
    started_at: null,
    exit_code: null,
    error: null,
    recovered: false,
  };
}

beforeEach(() => {
  useStore.setState({ env: ENV, rosConnected: false, processes: {} });
});

describe("StatusBar", () => {
  it("shows the environment and the disconnected ROS state", () => {
    render(<StatusBar />);

    expect(screen.getByText("ROS jazzy")).toBeInTheDocument();
    expect(screen.getByText("Domain 0")).toBeInTheDocument();
    expect(screen.getByText("Workspace /ws")).toBeInTheDocument();
    expect(screen.getByText("ROS disconnected")).toBeInTheDocument();
  });

  it("shows the connected ROS state", () => {
    useStore.setState({ rosConnected: true });

    render(<StatusBar />);

    expect(screen.getByText("ROS connected")).toBeInTheDocument();
  });

  it("shows placeholders before the environment arrives", () => {
    useStore.setState({ env: null });

    render(<StatusBar />);

    expect(screen.getByText("ROS —")).toBeInTheDocument();
    expect(screen.getByText("Domain —")).toBeInTheDocument();
    expect(screen.getByText("Workspace —")).toBeInTheDocument();
  });

  it("persists and applies the chosen theme", () => {
    render(<StatusBar />);

    fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(loadPreferences().theme).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("counts running processes and failed ones", () => {
    useStore.setState({
      processes: {
        a: processRecord("a", "running"),
        b: processRecord("b", "starting"),
        c: processRecord("c", "failed"),
      },
    });

    render(<StatusBar />);

    expect(screen.getByText("Processes 2")).toBeInTheDocument();
    expect(screen.getByText("Errors 1")).toBeInTheDocument();
  });
});
