import type { IDockviewPanelProps } from "dockview-react";

export function PlaceholderPanel({ api }: IDockviewPanelProps) {
  return (
    <section className="panel-placeholder" aria-label={api.title}>
      <p>{api.title}</p>
    </section>
  );
}
