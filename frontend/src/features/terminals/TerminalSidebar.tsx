import { Button } from "@/components/ui/button";

import type { TerminalRecord } from "../../api/types";
import { TerminalList } from "./TerminalList";

export function TerminalSidebar({
  workspaces,
  selectedWorkspaceId,
  records,
  activeTerminalId,
  minimizedIds,
  onSelectWorkspace,
  onAddWorkspace,
  onDeleteWorkspace,
  onSelectTerminal,
  onRestoreTerminal,
  onCloseTerminal,
}: {
  workspaces: { id: string; name: string; path: string }[];
  selectedWorkspaceId: string | null;
  records: TerminalRecord[];
  activeTerminalId: string | null;
  minimizedIds: string[];
  onSelectWorkspace: (id: string) => void;
  onAddWorkspace: () => void;
  onDeleteWorkspace: (id: string) => void;
  onSelectTerminal: (terminalId: string) => void;
  onRestoreTerminal: (terminalId: string) => void;
  onCloseTerminal: (record: TerminalRecord) => void;
}) {
  return (
    <aside
      className="flex w-64 min-w-48 max-w-2xl shrink-0 resize-x flex-col gap-2 overflow-y-auto border-r border-border pr-3"
      aria-label="Workspaces"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          Workspaces
        </h3>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="New workspace"
          onClick={onAddWorkspace}
        >
          +
        </Button>
      </div>
      {workspaces.length === 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          No workspaces yet. Add the folder of your colcon workspace.
        </p>
      )}
      <ul className="space-y-2">
        {workspaces.map((workspace) => {
          const selected = workspace.id === selectedWorkspaceId;
          return (
            <li key={workspace.id} className="space-y-1">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={selected ? "secondary" : "ghost"}
                  aria-pressed={selected}
                  title={workspace.path}
                  className="h-7 min-w-0 flex-1 justify-start truncate px-1 text-xs"
                  onClick={() => onSelectWorkspace(workspace.id)}
                >
                  {workspace.name}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${workspace.name}`}
                  onClick={() => onDeleteWorkspace(workspace.id)}
                >
                  ×
                </Button>
              </div>
              {selected && (
                <TerminalList
                  records={records}
                  activeTerminalId={activeTerminalId}
                  minimizedIds={minimizedIds}
                  onSelect={onSelectTerminal}
                  onRestore={onRestoreTerminal}
                  onClose={onCloseTerminal}
                />
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
