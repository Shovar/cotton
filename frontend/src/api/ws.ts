import type { ServerEvent } from "./types";
import { getToken } from "./session";

export const BASE_RECONNECT_DELAY_MS = 1_000;
export const MAX_RECONNECT_DELAY_MS = 30_000;

export type ConnectionStatus = "connecting" | "open" | "closed";
export type ServerEventHandler = (event: ServerEvent) => void;
export type StatusHandler = (status: ConnectionStatus) => void;

export function nextDelay(attempt: number): number {
  const exponent = Math.max(0, Math.floor(attempt));
  return Math.min(BASE_RECONNECT_DELAY_MS * 2 ** exponent, MAX_RECONNECT_DELAY_MS);
}

export function websocketUrl(
  token: string,
  host: string = location.host,
  secure: boolean = location.protocol === "https:",
): string {
  const protocol = secure ? "wss" : "ws";
  return `${protocol}://${host}/ws?token=${encodeURIComponent(token)}`;
}

export interface WsClientOptions {
  url?: string;
  socketFactory?: (url: string) => WebSocket;
}

interface SocketHandlers {
  onopen: (() => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: (() => void) | null;
}

export class WsClient {
  private socket: WebSocket | null = null;
  private token = "";
  private attempt = 0;
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly channels = new Set<string>();
  private readonly eventHandlers = new Set<ServerEventHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();

  constructor(private readonly options: WsClientOptions = {}) {}

  connect(token: string = getToken() ?? ""): void {
    this.token = token;
    this.closed = false;
    if (this.socket) {
      return;
    }
    this.open();
  }

  subscribe(channels: string[]): void {
    let added = false;
    for (const channel of channels) {
      if (!this.channels.has(channel)) {
        this.channels.add(channel);
        added = true;
      }
    }
    if (added && this.socket?.readyState === WebSocket.OPEN) {
      this.sendSubscribe();
    }
  }

  send(type: string, data: Record<string, unknown>): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify({ type, data }));
    return true;
  }

  onEvent(handler: ServerEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      const handlers = socket as unknown as SocketHandlers;
      handlers.onclose = null;
      socket.close();
    }
    this.emitStatus("closed");
  }

  private open(): void {
    const url = this.options.url ?? websocketUrl(this.token);
    const socket = this.options.socketFactory
      ? this.options.socketFactory(url)
      : new WebSocket(url);
    this.socket = socket;
    this.emitStatus("connecting");

    socket.onopen = () => {
      this.attempt = 0;
      this.emitStatus("open");
      this.sendSubscribe();
    };
    socket.onmessage = (event: MessageEvent) => this.handleMessage(event.data);
    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      this.emitStatus("closed");
      if (!this.closed) {
        this.scheduleReconnect();
      }
    };
  }

  private sendSubscribe(): void {
    if (this.socket?.readyState !== WebSocket.OPEN || this.channels.size === 0) {
      return;
    }
    this.socket.send(
      JSON.stringify({ type: "subscribe", channels: [...this.channels] }),
    );
  }

  private scheduleReconnect(): void {
    const delay = nextDelay(this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private handleMessage(raw: unknown): void {
    try {
      const event = JSON.parse(String(raw)) as ServerEvent;
      if (typeof event?.type === "string") {
        for (const handler of this.eventHandlers) {
          handler(event);
        }
      }
    } catch {
      this.emit({
        type: "error",
        data: { code: "invalid_message", message: "Malformed WebSocket message" },
      });
    }
  }

  private emit(event: ServerEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  private emitStatus(status: ConnectionStatus): void {
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }
}

export const ws = new WsClient();
