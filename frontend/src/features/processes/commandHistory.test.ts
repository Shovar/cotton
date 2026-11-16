import { describe, expect, it, vi } from "vitest";

import { loadCommandHistory, rememberCommand, saveCommandHistory } from "./commandHistory";

describe("rememberCommand", () => {
  it("appends a command and moves a repeated one to the end", () => {
    const history = rememberCommand(["ros2 topic list", "ros2 node list"], "ros2 topic list");

    expect(history).toEqual(["ros2 node list", "ros2 topic list"]);
  });

  it("ignores an empty command", () => {
    expect(rememberCommand(["ros2 topic list"], "  ")).toEqual(["ros2 topic list"]);
  });

  it("keeps only the newest hundred commands", () => {
    const history = Array.from({ length: 100 }, (_, index) => `cmd ${index}`);

    const next = rememberCommand(history, "cmd 100");

    expect(next).toHaveLength(100);
    expect(next[0]).toBe("cmd 1");
    expect(next.at(-1)).toBe("cmd 100");
  });
});

describe("loadCommandHistory", () => {
  it("reads stored commands and drops invalid entries", () => {
    const storage = {
      getItem: vi.fn(() =>
        JSON.stringify(["ros2 topic list", 4, null, "  ", "ros2 node list"]),
      ),
    };

    expect(loadCommandHistory(storage)).toEqual(["ros2 topic list", "ros2 node list"]);
  });

  it("returns an empty history for missing or malformed storage", () => {
    expect(loadCommandHistory({ getItem: () => null })).toEqual([]);
    expect(loadCommandHistory({ getItem: () => "{" })).toEqual([]);
    expect(loadCommandHistory({ getItem: () => JSON.stringify({}) })).toEqual([]);
  });

  it("caps loaded history at the newest hundred entries", () => {
    const stored = Array.from({ length: 105 }, (_, index) => `cmd ${index}`);

    const history = loadCommandHistory({ getItem: () => JSON.stringify(stored) });

    expect(history).toHaveLength(100);
    expect(history[0]).toBe("cmd 5");
  });
});

describe("saveCommandHistory", () => {
  it("stores the newest commands", () => {
    const setItem = vi.fn();
    const history = Array.from({ length: 101 }, (_, index) => `cmd ${index}`);

    saveCommandHistory(history, { setItem });

    expect(setItem).toHaveBeenCalledWith(
      "ros-studio-command-history",
      JSON.stringify(history.slice(1)),
    );
  });

  it("does not throw when storage rejects the write", () => {
    expect(() =>
      saveCommandHistory(["ros2 topic list"], {
        setItem: () => {
          throw new Error("quota");
        },
      }),
    ).not.toThrow();
  });
});
