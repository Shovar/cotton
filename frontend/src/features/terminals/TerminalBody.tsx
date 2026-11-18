import type { TerminalRecord } from "../../api/types";
import { ws } from "../../api/ws";
import { Button } from "@/components/ui/button";

import type { TerminalGroupRecord } from "./TerminalGroup";
import { TerminalView } from "./TerminalView";
import { useTerminalStore, type TerminalOutputChunk } from "./terminalStore";

const EMPTY_OUTPUT_CHUNKS: TerminalOutputChunk[] = [];

export interface TerminalBodyProps {
  groups: TerminalGroupRecord[];
  selectedGroupId: string;
  records: Record<string, TerminalRecord>;
  activeTerminalByGroup: Record<string, string | null>;
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
  groups,
  selectedGroupId,
  records,
  activeTerminalByGroup,
  minimizedIds,
  onSelect,
}: TerminalBodyProps) {
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  // One pane per terminal, shared by all groups: switching or moving never remounts
  // xterm, and hidden panes keep the body geometry so they need no refit when shown.
  const mounted = groups.flatMap((group) =>
    group.terminalIds
      .filter((id) => !minimizedIds.includes(id) && records[id])
      .map((id) => ({ group, id })),
  );
  const selectedIds = mounted
    .filter((entry) => entry.group.id === selectedGroupId)
    .map((entry) => entry.id);
  const active = activeTerminalByGroup[selectedGroupId] ?? null;
  const visibleId =
    active && selectedIds.includes(active) ? active : (selectedIds[0] ?? null);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
      <div
        role="tablist"
        aria-label={`${selectedGroup?.name ?? "Selected"} terminals`}
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border p-1"
      >
        {selectedIds.map((terminalId) => (
          <Button
            key={terminalId}
            role="tab"
            aria-selected={terminalId === visibleId}
            size="sm"
            variant={terminalId === visibleId ? "secondary" : "ghost"}
            className="max-w-48"
            onClick={() => onSelect(terminalId)}
          >
            <span className="truncate">{terminalId}</span>
          </Button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        {mounted.map(({ group, id }) => {
          const visible = group.id === selectedGroupId && id === visibleId;
          return (
            <div
              key={id}
              data-terminal-id={id}
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
              <TerminalPane terminalId={id} />
            </div>
          );
        })}
        {!visibleId && (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No terminals in this group
          </p>
        )}
      </div>
    </section>
  );
}
