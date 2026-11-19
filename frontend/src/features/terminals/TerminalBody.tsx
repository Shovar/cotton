import { Minimize2, Plus, SquareTerminal } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { TerminalRecord } from "../../api/types";
import { ws } from "../../api/ws";

import { TerminalView } from "./TerminalView";
import { useTerminalStore, type TerminalOutputChunk } from "./terminalStore";

const EMPTY_OUTPUT_CHUNKS: TerminalOutputChunk[] = [];

export interface TerminalBodyProps {
  records: TerminalRecord[];
  activeTerminalId: string | null;
  minimizedIds: string[];
  canCreate: boolean;
  onCreate: () => void;
  onMinimize: () => void;
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
  canCreate,
  onCreate,
  onMinimize,
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
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-1.5 py-1">
        <div
          role="tablist"
          aria-label="Terminals"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        >
          {mounted.map((record) => {
            const selected = record.spec.id === visibleId;
            return (
              <button
                key={record.spec.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`flex h-7 max-w-52 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                  selected
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                onClick={() => onSelect(record.spec.id)}
              >
                <SquareTerminal aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate font-mono">{record.spec.id}</span>
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Minimize terminal"
            title="Minimize terminal"
            disabled={!visibleId}
            onClick={onMinimize}
          >
            <Minimize2 aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2"
            disabled={!canCreate}
            onClick={onCreate}
          >
            <Plus aria-hidden="true" />
            New shell
          </Button>
        </div>
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
