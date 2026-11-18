import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerEvent } from "./types";
import { nextDelay, websocketUrl, WsClient } from "./ws";

class FakeSocket {
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  serverClose(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

function createClient() {
  const sockets: FakeSocket[] = [];
  const factory = (url: string) => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket as unknown as WebSocket;
  };
  const client = new WsClient({ url: "ws://test/ws?token=t", socketFactory: factory });
  return { client, sockets };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("nextDelay", () => {
  it("backs off from one second", () => {
    expect(nextDelay(0)).toBe(1_000);
    expect(nextDelay(1)).toBe(2_000);
    expect(nextDelay(2)).toBe(4_000);
  });

  it("caps at thirty seconds", () => {
    expect(nextDelay(5)).toBe(30_000);
    expect(nextDelay(50)).toBe(30_000);
  });

  it("treats negative attempts as the first one", () => {
    expect(nextDelay(-3)).toBe(1_000);
  });
});

describe("websocketUrl", () => {
  it("passes the token as a query parameter", () => {
    expect(websocketUrl("a b", "127.0.0.1:8000", false)).toBe(
      "ws://127.0.0.1:8000/ws?token=a%20b",
    );
  });

  it("uses wss for secure pages", () => {
    expect(websocketUrl("t", "example.test", true)).toBe(
      "wss://example.test/ws?token=t",
    );
  });
});

describe("WsClient", () => {
  it("reports status and sends accumulated subscriptions on open", () => {
    const { client, sockets } = createClient();
    const statuses: string[] = [];
    client.onStatus((status) => statuses.push(status));

    client.subscribe(["graph"]);
    client.connect("tok");
    sockets[0].open();

    expect(statuses).toEqual(["connecting", "open"]);
    expect(sockets[0].sent).toEqual([
      JSON.stringify({ type: "subscribe", channels: ["graph"] }),
    ]);
  });

  it("subscribes immediately when the socket is already open", () => {
    const { client, sockets } = createClient();
    client.connect();
    sockets[0].open();

    client.subscribe(["graph"]);
    client.subscribe(["graph", "processes"]);

    expect(sockets[0].sent).toHaveLength(2);
    expect(JSON.parse(sockets[0].sent[1])).toEqual({
      type: "subscribe",
      channels: ["graph", "processes"],
    });
  });

  it("sends terminal input only while open and never replays it after reconnect", () => {
    const { client, sockets } = createClient();
    expect(client.send("terminal.input", { id: "t1", data: "aGVsbG8=" })).toBe(false);

    client.connect();
    sockets[0].open();
    expect(client.send("terminal.input", { id: "t1", data: "aGVsbG8=" })).toBe(true);
    sockets[0].serverClose();

    expect(client.send("terminal.input", { id: "t1", data: "c3RhbGU=" })).toBe(false);
    vi.advanceTimersByTime(1_000);
    sockets[1].open();

    expect(sockets[0].sent).toEqual([
      JSON.stringify({
        type: "terminal.input",
        data: { id: "t1", data: "aGVsbG8=" },
      }),
    ]);
    expect(sockets[1].sent).toEqual([]);
  });

  it("delivers server events and supports unsubscribing", () => {
    const { client, sockets } = createClient();
    const events: ServerEvent[] = [];
    const unsubscribe = client.onEvent((event) => events.push(event));
    client.connect();
    sockets[0].open();

    sockets[0].receive(
      JSON.stringify({ type: "ros.status", data: { connected: true, error: null } }),
    );
    unsubscribe();
    sockets[0].receive(
      JSON.stringify({ type: "ros.status", data: { connected: false, error: null } }),
    );

    expect(events).toEqual([
      { type: "ros.status", data: { connected: true, error: null } },
    ]);
  });

  it("reports malformed frames as an explicit error event", () => {
    const { client, sockets } = createClient();
    const events: ServerEvent[] = [];
    client.onEvent((event) => events.push(event));
    client.connect();
    sockets[0].open();

    sockets[0].receive("{not json");

    expect(events).toEqual([
      {
        type: "error",
        data: { code: "invalid_message", message: "Malformed WebSocket message" },
      },
    ]);
  });

  it("reconnects with exponential backoff", () => {
    const { client, sockets } = createClient();
    client.subscribe(["graph"]);
    client.connect();
    sockets[0].open();

    sockets[0].serverClose();
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    sockets[1].serverClose();
    vi.advanceTimersByTime(1_999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
  });

  it("resubscribes to accumulated channels after reconnecting", () => {
    const { client, sockets } = createClient();
    client.subscribe(["graph"]);
    client.connect();
    sockets[0].open();
    sockets[0].serverClose();
    vi.advanceTimersByTime(1_000);

    sockets[1].open();

    expect(sockets[1].sent[0]).toContain("graph");
  });

  it("resets the backoff after a successful reconnect", () => {
    const { client, sockets } = createClient();
    client.connect();
    sockets[0].open();
    sockets[0].serverClose();
    vi.advanceTimersByTime(1_000);

    sockets[1].open();
    sockets[1].serverClose();
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
  });

  it("does not reconnect after an explicit close", () => {
    const { client, sockets } = createClient();
    client.connect();
    sockets[0].open();

    client.close();
    vi.advanceTimersByTime(30_000);

    expect(sockets).toHaveLength(1);
  });

  it("ignores a second connect while a socket exists", () => {
    const { client, sockets } = createClient();
    client.connect();
    client.connect();

    expect(sockets).toHaveLength(1);
  });
});
