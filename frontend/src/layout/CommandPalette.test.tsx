import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette } from "./CommandPalette";

describe("CommandPalette", () => {
  it("opens with Ctrl+Shift+P and runs the chosen action", () => {
    const onAction = vi.fn();
    render(<CommandPalette onAction={onAction} />);

    fireEvent.keyDown(window, { key: "P", ctrlKey: true, shiftKey: true });
    fireEvent.click(screen.getByText("Open graph"));

    expect(onAction).toHaveBeenCalledWith("open-graph");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("filters actions by text", () => {
    render(<CommandPalette onAction={() => {}} />);

    fireEvent.keyDown(window, { key: "P", ctrlKey: true, shiftKey: true });
    fireEvent.change(screen.getByPlaceholderText("Search actions"), {
      target: { value: "plugins" },
    });

    expect(screen.getByText("Open plugins")).toBeInTheDocument();
    expect(screen.queryByText("Open graph")).not.toBeInTheDocument();
  });

  it("closes with Escape", () => {
    render(<CommandPalette onAction={() => {}} />);

    fireEvent.keyDown(window, { key: "P", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
