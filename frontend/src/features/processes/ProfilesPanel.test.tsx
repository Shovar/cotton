import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProcessRecord } from "../../api/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiSend = vi.hoisted(() => vi.fn());
vi.mock("../../api/client", () => ({ apiGet, apiSend }));

import { ProfilesPanel } from "./ProfilesPanel";

const PROCESS: ProcessRecord = {
  id: "p1",
  spec: { id: "p1", argv: ["sleep", "5"], cwd: null, env: {}, plugin: null, autostart: false },
  state: "running",
  pid: 10,
  pgid: 10,
  started_at: "2026-11-06T12:00:00Z",
  exit_code: null,
  error: null,
  recovered: false,
};

beforeEach(() => {
  apiGet.mockReset();
  apiSend.mockReset();
  apiGet.mockResolvedValue([]);
});

describe("ProfilesPanel", () => {
  it("saves the current processes as a profile", async () => {
    apiSend.mockResolvedValue({});

    render(<ProfilesPanel processes={[PROCESS]} />);
    fireEvent.change(screen.getByLabelText("Profile name"), {
      target: { value: "Sim" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save as profile" }));

    await waitFor(() =>
      expect(apiSend).toHaveBeenCalledWith("POST", "/api/profiles", {
        id: "sim",
        name: "Sim",
        processes: [PROCESS.spec],
      }),
    );
  });

  it("starts a saved profile", async () => {
    apiGet.mockResolvedValue([{ id: "sim", name: "Simulation", processes: [] }]);
    apiSend.mockResolvedValue([]);

    render(<ProfilesPanel processes={[]} />);
    expect(await screen.findByText("No processes in this profile")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));

    await waitFor(() =>
      expect(apiSend).toHaveBeenCalledWith("POST", "/api/profiles/sim/start"),
    );
  });

  it("shows the command and working directory stored in a profile", async () => {
    apiGet.mockResolvedValue([
      {
        id: "sim",
        name: "Sim",
        processes: [
          {
            id: "a",
            argv: ["ros2", "launch", "demo", "demo.launch.py"],
            cwd: "/ws",
            env: {},
            plugin: null,
            autostart: false,
          },
        ],
      },
    ]);

    render(<ProfilesPanel processes={[]} />);

    expect(await screen.findByText("ros2 launch demo demo.launch.py")).toBeInTheDocument();
    expect(screen.getByText("cwd /ws")).toBeInTheDocument();
  });
});
