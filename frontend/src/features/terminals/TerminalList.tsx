import { RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { TerminalRecord, TerminalState } from "../../api/types";

const STATE_LABELS = {
  starting: "Starting",
  running: "Running",
  exited: "Exited",
  failed: "Failed",
} as const;

const STATE_DOTS: Record<TerminalState, string> = {
  starting: "animate-pulse bg-warning",
  running: "bg-success",
  exited: "bg-muted-foreground/50",
  failed: "bg-destructive",
};

export function TerminalList({
  records,
  activeTerminalId,
  minimizedIds,
  onSelect,
  onRestore,
  onClose,
}: {
  records: TerminalRecord[];
  activeTerminalId: string | null;
  minimizedIds: string[];
  onSelect: (terminalId: string) => void;
  onRestore: (terminalId: string) => void;
  onClose: (record: TerminalRecord) => void;
}) {
  if (records.length === 0) {
    return <p className="px-2 py-1.5 text-xs text-muted-foreground">No terminals</p>;
  }

  return (
    <ul
      aria-label="Terminal sessions"
      className="mb-1 ml-3 space-y-px border-l border-border pl-1.5"
    >
      {records.map((record) => {
        const id = record.spec.id;
        const minimized = minimizedIds.includes(id);
        return (
          <li
            key={id}
            className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-accent/60"
            data-state={record.state}
          >
            <span
              className={`size-1.5 shrink-0 rounded-full ${STATE_DOTS[record.state]}`}
              aria-hidden="true"
            />
            <button
              type="button"
              aria-pressed={id === activeTerminalId}
              className="min-w-0 flex-1 truncate rounded text-left font-mono text-xs text-muted-foreground outline-none group-hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:font-semibold aria-pressed:text-foreground"
              onClick={() => (minimized ? onRestore(id) : onSelect(id))}
            >
              {id}
            </button>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {STATE_LABELS[record.state]}
            </span>
            {record.exit_code !== null && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                exit {record.exit_code}
              </span>
            )}
            {minimized && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={`Restore ${id}`}
                title={`Restore ${id}`}
                onClick={() => onRestore(id)}
              >
                <RotateCcw aria-hidden="true" />
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Close ${id}`}
              title={`Close ${id}`}
              onClick={() => onClose(record)}
            >
              <X aria-hidden="true" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
