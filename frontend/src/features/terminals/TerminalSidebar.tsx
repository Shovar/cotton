import { Folder, FolderOpen, Plus, X } from "lucide-react";

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
      className="flex w-64 min-w-48 max-w-2xl shrink-0 resize-x flex-col overflow-hidden border-r border-border bg-card/60"
      aria-label="Workspaces"
    >
      <div className="flex shrink-0 items-center gap-1 px-2 py-1.5">
        <h3 className="min-w-0 flex-1 truncate px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Projects
        </h3>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6"
          aria-label="New workspace"
          title="New workspace"
          onClick={onAddWorkspace}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {workspaces.length === 0 && (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            No workspaces yet. Add the folder of your colcon workspace.
          </p>
        )}
        <ul className="space-y-0.5">
          {workspaces.map((workspace) => {
            const selected = workspace.id === selectedWorkspaceId;
            const Icon = selected ? FolderOpen : Folder;
            return (
              <li key={workspace.id}>
                <div
                  className={`group flex items-center gap-1 rounded-md pr-1 ${
                    selected ? "bg-accent/60" : ""
                  }`}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    aria-pressed={selected}
                    title={workspace.path}
                    className="h-8 min-w-0 flex-1 justify-start gap-2 px-2 text-xs hover:bg-transparent"
                    onClick={() => onSelectWorkspace(workspace.id)}
                  >
                    <Icon
                      aria-hidden="true"
                      className={selected ? "text-primary" : "text-muted-foreground"}
                    />
                    <span className="truncate font-medium">{workspace.name}</span>
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Delete ${workspace.name}`}
                    title={`Delete ${workspace.name}`}
                    onClick={() => onDeleteWorkspace(workspace.id)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
                {selected && (
                  <>
                    <p
                      className="truncate px-2 pb-1 font-mono text-[10px] text-muted-foreground"
                      title={workspace.path}
                    >
                      {workspace.path}
                    </p>
                    <TerminalList
                      records={records}
                      activeTerminalId={activeTerminalId}
                      minimizedIds={minimizedIds}
                      onSelect={onSelectTerminal}
                      onRestore={onRestoreTerminal}
                      onClose={onCloseTerminal}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
