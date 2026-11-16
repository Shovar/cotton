import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LogLine } from "../../api/types";
import { useStore } from "../../state/store";

const subscribe = vi.hoisted(() => vi.fn());
vi.mock("../../api/ws", () => ({ ws: { subscribe } }));

import { LogsPanel } from "./LogsPanel";

function line(level: LogLine["level"], text: string): LogLine {
  return { id: "p1", stream: "stdout", level, ts: "2026-11-06T12:00:00Z", text };
}

beforeEach(() => {
  subscribe.mockReset();
  useStore.setState({ logs: {} });
});

describe("LogsPanel", () => {
  it("filters by level and text together", () => {
    useStore.setState({
      logs: { p1: [line("info", "hola"), line("error", "fallo")] },
    });

    render(<LogsPanel processId="p1" />);
    expect(subscribe).toHaveBeenCalledWith(["logs:p1"]);

    fireEvent.change(screen.getByLabelText("Level"), { target: { value: "error" } });
    expect(screen.queryByText("hola")).not.toBeInTheDocument();
    expect(screen.getByText("fallo")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search logs"), {
      target: { value: "nada" },
    });
    expect(screen.queryByText("fallo")).not.toBeInTheDocument();
  });

  it("downloads only the visible lines", () => {
    useStore.setState({
      logs: { p1: [line("info", "hola"), line("error", "fallo")] },
    });
    const createObjectURL = vi.fn().mockReturnValue("blob:logs");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<LogsPanel processId="p1" />);
    fireEvent.change(screen.getByLabelText("Level"), { target: { value: "error" } });
    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("closes the console without touching the process", () => {
    const onClose = vi.fn();

    render(<LogsPanel processId="p1" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close logs" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
