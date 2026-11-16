import { useEffect, useState } from "react";

const ACTIONS = [
  { id: "open-graph", label: "Open graph" },
  { id: "open-processes", label: "Open processes" },
  { id: "open-plugins", label: "Open plugins" },
] as const;

export function CommandPalette({ onAction }: { onAction: (action: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setOpen((current) => !current);
        setQuery("");
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  if (!open) {
    return null;
  }

  const needle = query.trim().toLowerCase();
  const actions = ACTIONS.filter((action) => action.label.toLowerCase().includes(needle));
  const run = (id: string) => {
    onAction(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="command-palette" role="dialog" aria-label="Command palette">
      <input
        autoFocus
        type="search"
        aria-label="Search actions"
        placeholder="Search actions"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul>
        {actions.map((action) => (
          <li key={action.id}>
            <button type="button" onClick={() => run(action.id)}>
              {action.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
