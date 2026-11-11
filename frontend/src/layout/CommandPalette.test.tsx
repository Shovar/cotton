import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette } from "./CommandPalette";

describe("CommandPalette", () => {
  it("opens with Ctrl+Shift+P and runs the chosen action", () => {
    const onAction = vi.fn();
    render(<CommandPalette onAction={onAction} />);

    fireEvent.keyDown(window, { key: "P", ctrlKey: true, shiftKey: true });
    fireEvent.click(screen.getByText("Abrir grafo"));

    expect(onAction).toHaveBeenCalledWith("open-graph");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("filters actions by text", () => {
    render(<CommandPalette onAction={() => {}} />);

    fireEvent.keyDown(window, { key: "P", ctrlKey: true, shiftKey: true });
    fireEvent.change(screen.getByPlaceholderText("Buscar acción"), {
      target: { value: "plugins" },
    });

    expect(screen.getByText("Abrir plugins")).toBeInTheDocument();
    expect(screen.queryByText("Abrir grafo")).not.toBeInTheDocument();
  });

  it("closes with Escape", () => {
    render(<CommandPalette onAction={() => {}} />);

    fireEvent.keyDown(window, { key: "P", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
