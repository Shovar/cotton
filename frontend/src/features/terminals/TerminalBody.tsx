import type { TerminalRecord } from "../../api/types";
import { ws } from "../../api/ws";
import { Button } from "@/components/ui/button";

import { TerminalView } from "./TerminalView";
import { useTerminalStore, type TerminalOutputChunk } from "./terminalStore";

const EMPTY_OUTPUT_CHUNKS: TerminalOutputChunk[] = [];

export interface TerminalBodyProps {
  records: TerminalRecord[];
  activeTerminalId: string | null;
  minimizedIds: string[];
  onSelect: (terminalId: string) => void;
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

function TerminalPane({ terminalId }: { terminalId: string }) {
  const outputChunks = useTerminalStore(
    (state) => state.outputChunks[terminalId] ?? EMPTY_OUTPUT_CHUNKS,
  );

  return (
    <TerminalView
      terminalId={terminalId}
      outputChunks={outputChunks}
      onInput={(data) =>
        ws.send("terminal.input", { id: terminalId, data: encodeBase64(data) })
      }
      onResize={(cols, rows) =>
        ws.send("terminal.resize", { id: terminalId, cols, rows })
      }
    />
  );
}

export function TerminalBody({
  records,
  activeTerminalId,
  minimizedIds,
  onSelect,
}: TerminalBodyProps) {
  // One pane per terminal, shared across tabs: switching never remounts xterm,
  // and hidden panes keep the body geometry so they need no refit when shown.
  const mounted = records.filter((record) => !minimizedIds.includes(record.spec.id));
  const visibleId =
    activeTerminalId && mounted.some((record) => record.spec.id === activeTerminalId)
      ? activeTerminalId
      : (mounted[0]?.spec.id ?? null);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
      <div
        role="tablist"
        aria-label="Terminals"
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border p-1"
      >
        {mounted.map((record) => (
          <Button
            key={record.spec.id}
            role="tab"
            aria-selected={record.spec.id === visibleId}
            size="sm"
            variant={record.spec.id === visibleId ? "secondary" : "ghost"}
            className="max-w-48"
            onClick={() => onSelect(record.spec.id)}
          >
            <span className="truncate">{record.spec.id}</span>
          </Button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        {mounted.map((record) => {
          const visible = record.spec.id === visibleId;
          return (
            <div
              key={record.spec.id}
              data-terminal-id={record.spec.id}
              data-terminal-visible={visible}
              aria-hidden={!visible}
              inert={!visible}
              className="absolute inset-0"
              style={{
                opacity: visible ? 1 : 0,
                pointerEvents: visible ? "auto" : "none",
                zIndex: visible ? 1 : 0,
              }}
            >
              <TerminalPane terminalId={record.spec.id} />
            </div>
          );
        })}
        {!visibleId && (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No terminals in this workspace
          </p>
        )}
      </div>
    </section>
  );
}
