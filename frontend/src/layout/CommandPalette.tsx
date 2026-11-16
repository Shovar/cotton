import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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
    <Dialog
      open
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
        }
      }}
    >
      <DialogContent
        aria-label="Command palette"
        aria-describedby={undefined}
        showCloseButton={false}
        className="top-[15%] translate-y-0 gap-2 p-2"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-1 pb-2">
          <Search aria-hidden="true" className="size-4 text-muted-foreground" />
          <Input
            autoFocus
            type="search"
            aria-label="Search actions"
            placeholder="Search actions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-7 border-0 bg-transparent px-0 focus-visible:ring-0"
          />
        </div>
        <ul className="grid max-h-64 gap-0.5 overflow-auto">
          {actions.map((action) => (
            <li key={action.id}>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto w-full justify-start px-2 py-1.5 font-normal"
                onClick={() => run(action.id)}
              >
                {action.label}
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
