import { create } from "zustand";

import type { ConnectionStatus } from "../../api/ws";
import type { ServerEvent, TerminalRecord } from "../../api/types";
import { ws } from "../../api/ws";

const OUTPUT_LIMIT = 65_536;

export interface TerminalOutputChunk {
  sequence: number;
  data: Uint8Array;
}

interface TerminalStore {
  records: Record<string, TerminalRecord>;
  lastSequences: Record<string, number>;
  outputChunks: Record<string, TerminalOutputChunk[]>;
  outputBytes: Record<string, number>;
  visibleAttachments: Record<string, true>;
  connection: ConnectionStatus;
  applyServerEvent: (event: ServerEvent) => void;
  setConnection: (connection: ConnectionStatus) => void;
  attach: (terminalId: string) => void;
  detach: (terminalId: string) => void;
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function appendOutput(
  existing: TerminalOutputChunk[],
  existingBytes: number,
  chunk: Uint8Array,
  sequence: number,
): { chunks: TerminalOutputChunk[]; bytes: number } {
  const chunks = [...existing, { sequence, data: chunk }];
  let bytes = existingBytes + chunk.byteLength;
  let first = 0;
  while (bytes > OUTPUT_LIMIT && first < chunks.length) {
    const excess = bytes - OUTPUT_LIMIT;
    const oldest = chunks[first];
    if (oldest.data.byteLength <= excess) {
      bytes -= oldest.data.byteLength;
      first += 1;
    } else {
      chunks[first] = { ...oldest, data: oldest.data.slice(excess) };
      bytes -= excess;
    }
  }
  return { chunks: chunks.slice(first), bytes };
}

export const useTerminalStore = create<TerminalStore>()((set, get) => ({
  records: {},
  lastSequences: {},
  outputChunks: {},
  outputBytes: {},
  visibleAttachments: {},
  connection: "closed",
  applyServerEvent: (event) => {
    if (event.type === "terminal.state") {
      set((state) => ({
        records: { ...state.records, [event.data.spec.id]: event.data },
      }));
    } else if (event.type === "terminal.output") {
      set((state) => {
        const lastSequence = state.lastSequences[event.data.id] ?? 0;
        if (event.data.sequence <= lastSequence) {
          return state;
        }
        const chunk = decodeBase64(event.data.data);
        const output = appendOutput(
          state.outputChunks[event.data.id] ?? [],
          state.outputBytes[event.data.id] ?? 0,
          chunk,
          event.data.sequence,
        );
        return {
          lastSequences: {
            ...state.lastSequences,
            [event.data.id]: event.data.sequence,
          },
          outputChunks: { ...state.outputChunks, [event.data.id]: output.chunks },
          outputBytes: { ...state.outputBytes, [event.data.id]: output.bytes },
        };
      });
    }
  },
  setConnection: (connection) => {
    const previous = get().connection;
    set({ connection });
    if (connection === "open" && previous !== "open") {
      const { visibleAttachments, lastSequences } = get();
      for (const terminalId of Object.keys(visibleAttachments)) {
        ws.send("terminal.attach", {
          id: terminalId,
          after_sequence: lastSequences[terminalId] ?? 0,
        });
      }
    }
  },
  attach: (terminalId) => {
    set((state) => ({
      visibleAttachments: { ...state.visibleAttachments, [terminalId]: true },
    }));
    if (get().connection === "open") {
      ws.send("terminal.attach", {
        id: terminalId,
        after_sequence: get().lastSequences[terminalId] ?? 0,
      });
    }
  },
  detach: (terminalId) => {
    const wasVisible = Boolean(get().visibleAttachments[terminalId]);
    set((state) => {
      const visibleAttachments = { ...state.visibleAttachments };
      delete visibleAttachments[terminalId];
      return { visibleAttachments };
    });
    if (wasVisible && get().connection === "open") {
      ws.send("terminal.detach", { id: terminalId });
    }
  },
}));
