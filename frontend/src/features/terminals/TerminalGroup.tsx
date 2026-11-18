import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

import type { TerminalRecord } from "../../api/types";
import { TerminalList } from "./TerminalList";

export interface TerminalGroupRecord {
  id: string;
  name: string;
  terminalIds: string[];
}

export function TerminalGroup({
  groups,
  selectedGroupId,
  records,
  activeTerminalByGroup,
  minimizedIds,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onSelectTerminal,
  onRestoreTerminal,
  onCloseTerminal,
  onMoveTerminal,
}: {
  groups: TerminalGroupRecord[];
  selectedGroupId: string;
  records: Record<string, TerminalRecord>;
  activeTerminalByGroup: Record<string, string | null>;
  minimizedIds: string[];
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onSelectTerminal: (groupId: string, terminalId: string) => void;
  onRestoreTerminal: (terminalId: string) => void;
  onCloseTerminal: (record: TerminalRecord) => void;
  onMoveTerminal: (terminalId: string, groupId: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");

  const create = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (name) {
      onCreate(name);
      setNewName("");
    }
  };

  const rename = (event: FormEvent) => {
    event.preventDefault();
    const name = editedName.trim();
    if (editingId && name) {
      onRename(editingId, name);
      setEditingId(null);
    }
  };

  return (
    <aside
      className="flex w-64 min-w-48 max-w-2xl shrink-0 resize-x flex-col gap-2 overflow-y-auto border-r border-border pr-3"
      aria-label="Groups"
    >
      <form className="flex gap-1" onSubmit={create}>
        <label className="sr-only" htmlFor="terminal-group-name">
          New group
        </label>
        <input
          id="terminal-group-name"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New group"
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!newName.trim()}>
          Create group
        </Button>
      </form>
      <ul className="space-y-3">
        {groups.map((group) => (
          <li key={group.id} className="space-y-1">
            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant={group.id === selectedGroupId ? "secondary" : "ghost"}
                aria-pressed={group.id === selectedGroupId}
                onClick={() => onSelect(group.id)}
              >
                {group.name}
              </Button>
              {editingId === group.id ? (
                <form className="flex w-full gap-1" onSubmit={rename}>
                  <label className="sr-only" htmlFor={`rename-${group.id}`}>
                    Group name
                  </label>
                  <input
                    id={`rename-${group.id}`}
                    value={editedName}
                    onChange={(event) => setEditedName(event.target.value)}
                    className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  />
                  <Button type="submit" size="sm" disabled={!editedName.trim()}>
                    Save group name
                  </Button>
                </form>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Rename ${group.name}`}
                  onClick={() => {
                    setEditingId(group.id);
                    setEditedName(group.name);
                  }}
                >
                  Rename
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Delete ${group.name}`}
                disabled={group.terminalIds.length > 0 || groups.length < 2}
                onClick={() => onDelete(group.id)}
              >
                Delete
              </Button>
            </div>
            <TerminalList
              groupId={group.id}
              groups={groups}
              records={group.terminalIds.flatMap((id) =>
                records[id] ? [records[id]] : [],
              )}
              activeTerminalId={activeTerminalByGroup[group.id] ?? null}
              minimizedIds={minimizedIds}
              onSelect={onSelectTerminal}
              onRestore={onRestoreTerminal}
              onClose={onCloseTerminal}
              onMove={onMoveTerminal}
            />
          </li>
        ))}
      </ul>
    </aside>
  );
}
