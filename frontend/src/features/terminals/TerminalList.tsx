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
  records,
  selectedId,
  groupId,
  groups,
  onSelect,
  onClose,
  onMove,
}: {
  records: TerminalRecord[];
  selectedId: string | null;
  groupId: string;
  groups: TerminalGroupRecord[];
  onSelect: (id: string) => void;
  onClose: (record: TerminalRecord) => void;
  onMove: (terminalId: string, groupId: string) => void;
}) {
  if (records.length === 0) {
    return <p>No terminals</p>;
  }

  return (
    <ul className="space-y-2" aria-label="Terminal sessions">
      {records.map((record) => (
        <li
          key={record.spec.id}
          className="flex items-center gap-2 rounded-md border border-border p-2"
          data-state={record.state}
        >
          <Button
            type="button"
            size="sm"
            variant={record.spec.id === selectedId ? "secondary" : "outline"}
            aria-pressed={record.spec.id === selectedId}
            onClick={() => onSelect(record.spec.id)}
          >
            {record.spec.id}
          </Button>
          <span>{STATE_LABELS[record.state]}</span>
          {record.exit_code !== null && <span>exit {record.exit_code}</span>}
          {groups.length > 1 && (
            <select
              aria-label={`Move ${record.spec.id} to group`}
              value={groupId}
              onChange={(event) => onMove(record.spec.id, event.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
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
            className="ml-auto"
            aria-label={`Close ${record.spec.id}`}
            onClick={() => onClose(record)}
          >
            Close
          </Button>
        </li>
      ))}
    </ul>
  );
}
