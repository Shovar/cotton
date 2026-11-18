import { Button } from "@/components/ui/button";

import type { TerminalRecord } from "../../api/types";
import type { TerminalGroupRecord } from "./TerminalGroup";

const STATE_LABELS = {
  starting: "Starting",
  running: "Running",
  exited: "Exited",
  failed: "Failed",
} as const;

export function TerminalList({
  groupId,
  records,
  groups,
  activeTerminalId,
  minimizedIds,
  onSelect,
  onRestore,
  onClose,
  onMove,
}: {
  groupId: string;
  records: TerminalRecord[];
  groups: TerminalGroupRecord[];
  activeTerminalId: string | null;
  minimizedIds: string[];
  onSelect: (groupId: string, terminalId: string) => void;
  onRestore: (terminalId: string) => void;
  onClose: (record: TerminalRecord) => void;
  onMove: (terminalId: string, groupId: string) => void;
}) {
  if (records.length === 0) {
    return <p className="px-1 text-xs text-muted-foreground">No terminals</p>;
  }

  return (
    <ul className="space-y-1" aria-label={`Terminals in group ${groupId}`}>
      {records.map((record) => {
        const id = record.spec.id;
        const minimized = minimizedIds.includes(id);
        return (
          <li
            key={id}
            className="rounded-md border border-border px-1 py-1"
            data-state={record.state}
          >
            <div className="flex min-w-0 items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant={id === activeTerminalId ? "secondary" : "ghost"}
                aria-pressed={id === activeTerminalId}
                className="h-7 min-w-0 flex-1 justify-start truncate px-1 text-xs"
                onClick={() => (minimized ? onRestore(id) : onSelect(groupId, id))}
              >
                {id}
              </Button>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {STATE_LABELS[record.state]}
              </span>
              {record.exit_code !== null && (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  exit {record.exit_code}
                </span>
              )}
            </div>
            <div className="flex items-center justify-end gap-1">
              {minimized && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Restore ${id}`}
                  onClick={() => onRestore(id)}
                >
                  Restore
                </Button>
              )}
              {groups.length > 1 && (
                <select
                  aria-label={`Move ${id} to group`}
                  value={groupId}
                  onChange={(event) => onMove(id, event.target.value)}
                  className="h-7 rounded-md border border-input bg-background px-1 text-xs"
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Close ${id}`}
                onClick={() => onClose(record)}
              >
                Close
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
