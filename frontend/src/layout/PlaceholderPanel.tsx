import type { IDockviewPanelProps } from "dockview-react";

export function PlaceholderPanel({ api }: IDockviewPanelProps) {
  return (
    <section
      className="grid h-full place-items-center text-sm text-muted-foreground"
      aria-label={api.title}
    >
      <p>{api.title}</p>
    </section>
  );
}
