import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TerminalRecord } from "../../api/types";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("../../api/ws", () => ({ ws: { send } }));

import { useTerminalStore } from "./terminalStore";

const record: TerminalRecord = {
  spec: {
    id: "t1",
    kind: "command",
    argv: ["echo", "hello"],
    cwd: "/tmp",
    env: {},
  },
  state: "running",
  pid: 10,
  started_at: null,
  exit_code: null,
  error: null,
};

beforeEach(() => {
  send.mockReset();
  useTerminalStore.setState({
    records: {},
    lastSequences: {},
    outputChunks: {},
    outputBytes: {},
    visibleAttachments: {},
    connection: "closed",
  });
});

describe("terminal store", () => {
  it("reduces terminal state and decodes output bytes by sequence", () => {
    const store = useTerminalStore.getState();
    store.applyServerEvent({ type: "terminal.state", data: record });
    store.applyServerEvent({
      type: "terminal.output",
      data: { id: "t1", sequence: 1, data: "aGVsbG8=" },
    });

    const state = useTerminalStore.getState();
    expect(state.records.t1).toEqual(record);
    expect(state.lastSequences.t1).toBe(1);
    expect([...state.outputChunks.t1[0].data]).toEqual([104, 101, 108, 108, 111]);
  });

  it("ignores duplicate terminal output sequences", () => {
    const store = useTerminalStore.getState();
    const event = {
      type: "terminal.output" as const,
      data: { id: "t1", sequence: 2, data: "b2s=" },
    };
    store.applyServerEvent(event);
    store.applyServerEvent(event);

    const state = useTerminalStore.getState();
    expect(state.lastSequences.t1).toBe(2);
    expect(state.outputChunks.t1).toHaveLength(1);
  });

  it("bounds retained output to the newest 64 KiB", () => {
    const store = useTerminalStore.getState();
    store.applyServerEvent({
      type: "terminal.output",
      data: { id: "t1", sequence: 1, data: btoa("x".repeat(40_000)) },
    });
    store.applyServerEvent({
      type: "terminal.output",
      data: { id: "t1", sequence: 2, data: btoa("y".repeat(40_000)) },
    });

    let chunks = useTerminalStore.getState().outputChunks.t1;
    expect(chunks.map((chunk) => chunk.data.byteLength)).toEqual([25_536, 40_000]);
    expect(chunks.reduce((size, chunk) => size + chunk.data.byteLength, 0)).toBe(65_536);

    store.applyServerEvent({
      type: "terminal.output",
      data: { id: "t1", sequence: 3, data: btoa("z".repeat(70_000)) },
    });
    chunks = useTerminalStore.getState().outputChunks.t1;
    expect(chunks).toHaveLength(1);
    expect(chunks[0].data.byteLength).toBe(65_536);
    expect(chunks[0].data[0]).toBe("z".charCodeAt(0));
  });

  it("reattaches visible terminals from their last sequence after reconnect", () => {
    const store = useTerminalStore.getState();
    store.applyServerEvent({
      type: "terminal.output",
      data: { id: "t1", sequence: 4, data: "b2s=" },
    });
    store.attach("t1");
    store.setConnection("open");

    expect(send).toHaveBeenLastCalledWith("terminal.attach", {
      id: "t1",
      after_sequence: 4,
    });

    store.applyServerEvent({
      type: "terminal.output",
      data: { id: "t1", sequence: 5, data: "b2s=" },
    });
    store.setConnection("closed");
    store.setConnection("open");

    expect(send).toHaveBeenLastCalledWith("terminal.attach", {
      id: "t1",
      after_sequence: 5,
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("does not reattach a terminal after it is detached", () => {
    const store = useTerminalStore.getState();
    store.setConnection("open");
    store.attach("t1");
    store.detach("t1");
    store.setConnection("closed");
    store.setConnection("open");

    expect(send.mock.calls.filter(([type]) => type === "terminal.attach")).toHaveLength(1);
    expect(send).toHaveBeenLastCalledWith("terminal.detach", { id: "t1" });
    expect(useTerminalStore.getState().visibleAttachments).toEqual({});
  });
});
