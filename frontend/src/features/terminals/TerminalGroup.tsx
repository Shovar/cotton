import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from "dockview-react";

import { Button } from "@/components/ui/button";

import { ws } from "../../api/ws";
import { TerminalView } from "./TerminalView";
import {
  useTerminalStore,
  type TerminalOutputChunk,
} from "./terminalStore";

export interface TerminalGroupRecord {
  id: string;
  name: string;
  terminalIds: string[];
}

const GroupActiveContext = createContext(false);
const EMPTY_OUTPUT_CHUNKS: TerminalOutputChunk[] = [];

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

function TerminalDockPanel({
  params,
}: IDockviewPanelProps<{ terminalId: string }>) {
  const isGroupActive = useContext(GroupActiveContext);
  const terminal = useTerminalStore((state) => state.records[params.terminalId]);
  const outputChunks = useTerminalStore(
    (state) => state.outputChunks[params.terminalId] ?? EMPTY_OUTPUT_CHUNKS,
  );

  if (!isGroupActive || !terminal) {
    return null;
  }

  return (
    <TerminalView
      terminalId={params.terminalId}
      outputChunks={outputChunks}
      onInput={(data) =>
        ws.send("terminal.input", {
          id: params.terminalId,
          data: encodeBase64(data),
        })
      }
      onResize={(cols, rows) =>
        ws.send("terminal.resize", { id: params.terminalId, cols, rows })
      }
    />
  );
}

function TerminalDockTab({ api }: IDockviewPanelHeaderProps) {
  return <span className="truncate px-2 text-sm">{api.title}</span>;
}

export function TerminalGroupLayout({
  groupId,
  terminalIds,
  isActive,
  onActivePanelChange,
  onApi,
}: {
  groupId: string;
  terminalIds: string[];
  isActive: boolean;
  onActivePanelChange: (groupId: string, terminalId: string | null) => void;
  onApi: (groupId: string, api: DockviewApi | null) => void;
}) {
  const [api, setApi] = useState<DockviewApi | null>(null);
  const components = useMemo(() => ({ terminal: TerminalDockPanel }), []);
  const tabComponents = useMemo(() => ({ terminal: TerminalDockTab }), []);
  const onReady = useCallback((event: DockviewReadyEvent) => setApi(event.api), []);

  useEffect(() => {
    if (!api) {
      return;
    }

    const wantedIds = new Set(terminalIds);
    for (const panel of api.panels) {
      if (!wantedIds.has(panel.id)) {
        api.removePanel(panel);
      }
    }
    for (const [index, id] of terminalIds.entries()) {
      if (!api.getPanel(id)) {
        api.addPanel({
          id,
          component: "terminal",
          tabComponent: "terminal",
          title: id,
          params: { terminalId: id },
          inactive: index > 0,
        });
      }
    }
    onActivePanelChange(groupId, api.activePanel?.id ?? terminalIds[0] ?? null);
  }, [api, groupId, onActivePanelChange, terminalIds]);

  useEffect(() => {
    if (!api) {
      return;
    }
    onApi(groupId, api);
    return () => onApi(groupId, null);
  }, [api, groupId, onApi]);

  useEffect(() => {
    if (!api) {
      return;
    }
    const subscription = api.onDidActivePanelChange((event) =>
      onActivePanelChange(groupId, event.panel?.id ?? null),
    );
    return () => subscription.dispose();
  }, [api, groupId, onActivePanelChange]);

  return (
    <div
      className={`absolute inset-0 ${isActive ? "" : "invisible pointer-events-none"}`}
      aria-hidden={!isActive}
    >
      <GroupActiveContext.Provider value={isActive}>
        <DockviewReact
          components={components}
          tabComponents={tabComponents}
          onReady={onReady}
        />
      </GroupActiveContext.Provider>
    </div>
  );
}

export function TerminalGroup({
  groups,
  selectedGroupId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  groups: TerminalGroupRecord[];
  selectedGroupId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
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
    <aside className="flex w-48 shrink-0 flex-col gap-2 border-r border-border pr-3" aria-label="Groups">
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
      <ul className="space-y-1">
        {groups.map((group) => (
          <li key={group.id} className="flex flex-wrap items-center gap-1">
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
          </li>
        ))}
      </ul>
    </aside>
  );
}
