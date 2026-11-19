import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

import type { WorkspaceCommand } from "../../api/types";
import type { CommandPatch } from "./workspaceCommandsApi";

export function CommandBar({
  commands,
  onCreate,
  onUpdate,
  onDelete,
  onRun,
  onInsert,
  disabled,
}: {
  commands: WorkspaceCommand[];
  onCreate: (label: string, body: string, isStartup: boolean) => void;
  onUpdate: (id: string, patch: CommandPatch) => void;
  onDelete: (id: string) => void;
  onRun: (id: string) => void;
  onInsert: (body: string) => void;
  disabled: boolean;
}) {
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const [isStartup, setIsStartup] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedLabel, setEditedLabel] = useState("");
  const [editedBody, setEditedBody] = useState("");

  const create = (event: FormEvent) => {
    event.preventDefault();
    const nextLabel = label.trim();
    const nextBody = body.trim();
    if (!nextLabel || !nextBody) {
      return;
    }
    onCreate(nextLabel, nextBody, isStartup);
    setLabel("");
    setBody("");
    setIsStartup(false);
  };

  const save = (event: FormEvent, command: WorkspaceCommand) => {
    event.preventDefault();
    const nextLabel = editedLabel.trim();
    const nextBody = editedBody.trim();
    if (!nextLabel || !nextBody) {
      return;
    }
    onUpdate(command.id, { label: nextLabel, body: nextBody });
    setEditingId(null);
  };

  return (
    <section
      className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
      aria-label="Saved commands"
    >
      <ul className="flex flex-wrap items-center gap-2">
        {commands.map((command) => (
          <li key={command.id} className="flex flex-wrap items-center gap-1">
            <span className="text-xs font-medium">{command.label}</span>
            {command.is_startup && (
              <span className="rounded bg-muted px-1 text-[10px] uppercase">startup</span>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onRun(command.id)}
            >
              Run {command.label}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onInsert(command.body)}
            >
              Insert {command.label}
            </Button>
            <label className="flex items-center gap-1 text-[11px]">
              <input
                type="checkbox"
                aria-label={`Mark ${command.label} as startup`}
                checked={command.is_startup}
                disabled={disabled}
                onChange={(event) =>
                  onUpdate(command.id, { is_startup: event.target.checked })
                }
              />
              Startup
            </label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              aria-label={`Edit ${command.label}`}
              onClick={() => {
                setEditingId(command.id);
                setEditedLabel(command.label);
                setEditedBody(command.body);
              }}
            >
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              aria-label={`Delete ${command.label}`}
              onClick={() => onDelete(command.id)}
            >
              Delete
            </Button>
            {editingId === command.id && (
              <form className="flex items-center gap-1" onSubmit={(event) => save(event, command)}>
                <label className="sr-only" htmlFor={`command-edit-label-${command.id}`}>
                  Edit label
                </label>
                <input
                  id={`command-edit-label-${command.id}`}
                  aria-label="Edit label"
                  value={editedLabel}
                  onChange={(event) => setEditedLabel(event.target.value)}
                  className="h-7 w-24 rounded-md border border-input bg-background px-1 text-xs"
                />
                <label className="sr-only" htmlFor={`command-edit-body-${command.id}`}>
                  Edit body
                </label>
                <input
                  id={`command-edit-body-${command.id}`}
                  aria-label="Edit body"
                  value={editedBody}
                  onChange={(event) => setEditedBody(event.target.value)}
                  className="h-7 w-48 rounded-md border border-input bg-background px-1 text-xs"
                />
                <Button type="submit" size="sm" disabled={disabled}>
                  Save {command.label}
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <form className="flex flex-wrap items-center gap-1" onSubmit={create}>
        <label className="sr-only" htmlFor="command-label">
          Command label
        </label>
        <input
          id="command-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Label"
          className="h-7 w-24 rounded-md border border-input bg-background px-1 text-xs"
        />
        <label className="sr-only" htmlFor="command-body">
          Command body
        </label>
        <input
          id="command-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Command to save"
          className="h-7 w-48 rounded-md border border-input bg-background px-1 text-xs"
        />
        <label className="flex items-center gap-1 text-[11px]">
          <input
            type="checkbox"
            aria-label="Startup command"
            checked={isStartup}
            disabled={disabled}
            onChange={(event) => setIsStartup(event.target.checked)}
          />
          Startup
        </label>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={disabled || !label.trim() || !body.trim()}
        >
          Save command
        </Button>
      </form>
    </section>
  );
}
