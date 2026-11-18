import { Button } from "@/components/ui/button";

import type { TerminalRecord } from "../../api/types";

const STATE_LABELS = {
  starting: "Starting",
  running: "Running",
  exited: "Exited",
  failed: "Failed",
} as const;

export function TerminalList({
  records,
  selectedId,
  onSelect,
  onClose,
}: {
  records: TerminalRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: (record: TerminalRecord) => void;
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
