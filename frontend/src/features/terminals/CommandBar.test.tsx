import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceCommand } from "../../api/types";
import { CommandBar } from "./CommandBar";

function command(overrides: Partial<WorkspaceCommand> = {}): WorkspaceCommand {
  return {
    id: "cmd_1",
    workspace_id: "ws_a",
    label: "Build",
    body: "colcon build",
    is_startup: false,
    position: 0,
    ...overrides,
  };
}

function renderBar(commands: WorkspaceCommand[] = [command()]) {
  const handlers = {
    onCreate: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onRun: vi.fn(),
    onInsert: vi.fn(),
  };
  render(<CommandBar commands={commands} disabled={false} {...handlers} />);
  return handlers;
}

describe("CommandBar", () => {
  it("renders every saved command", () => {
    renderBar([command(), command({ id: "cmd_2", label: "Launch", position: 1 })]);

    expect(screen.getByText("Build")).toBeInTheDocument();
    expect(screen.getByText("Launch")).toBeInTheDocument();
  });

  it("runs a command by id", () => {
    const handlers = renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Run Build" }));

    expect(handlers.onRun).toHaveBeenCalledWith("cmd_1");
  });

  it("inserts a command body without running it", () => {
    const handlers = renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Insert Build" }));

    expect(handlers.onInsert).toHaveBeenCalledWith("colcon build");
  });

  it("marks a command as the startup command", () => {
    const handlers = renderBar();

    fireEvent.click(screen.getByLabelText("Mark Build as startup"));

    expect(handlers.onUpdate).toHaveBeenCalledWith("cmd_1", { is_startup: true });
  });

  it("edits a command", () => {
    const handlers = renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Edit Build" }));
    fireEvent.change(screen.getByLabelText("Edit label"), {
      target: { value: "Build all" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Build" }));

    expect(handlers.onUpdate).toHaveBeenCalledWith("cmd_1", {
      label: "Build all",
      body: "colcon build",
    });
  });

  it("deletes a command", () => {
    const handlers = renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Delete Build" }));

    expect(handlers.onDelete).toHaveBeenCalledWith("cmd_1");
  });

  it("blocks an empty new command", () => {
    const handlers = renderBar([]);
    const submit = screen.getByRole("button", { name: "Save command" });

    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Command label"), {
      target: { value: "Build" },
    });
    fireEvent.change(screen.getByLabelText("Command body"), {
      target: { value: "  " },
    });

    expect(submit).toBeDisabled();
    expect(handlers.onCreate).not.toHaveBeenCalled();
  });

  it("creates a command with the startup flag", () => {
    const handlers = renderBar([]);

    fireEvent.change(screen.getByLabelText("Command label"), {
      target: { value: "Setup" },
    });
    fireEvent.change(screen.getByLabelText("Command body"), {
      target: { value: "source setup.bash" },
    });
    fireEvent.click(screen.getByLabelText("Startup command"));
    fireEvent.click(screen.getByRole("button", { name: "Save command" }));

    expect(handlers.onCreate).toHaveBeenCalledWith("Setup", "source setup.bash", true);
  });
});
