import { useQuery } from "@tanstack/react-query";

import { apiGet } from "../../api/client";
import type { GraphSnapshot } from "../../api/types";
import { useStore } from "../../state/store";
import { GraphView } from "./GraphView";

export function GraphPanel() {
  const graph = useStore((state) => state.graph);
  const env = useStore((state) => state.env);
  useQuery({
    queryKey: ["graph"],
    queryFn: async () => {
      const snapshot = await apiGet<GraphSnapshot>("/api/graph");
      useStore.getState().setGraph(snapshot);
      return snapshot;
    },
  });

  if (!graph) {
    return <p className="panel-message">Waiting for the graph…</p>;
  }
  return (
    <section className="graph-panel" aria-label="Graph panel">
      <header className="graph-environment" aria-label="ROS environment">
        <span className="graph-environment-title">ROS environment</span>
        <span className="graph-environment-chip">ROS 2 {env?.distro ?? "—"}</span>
        <span className="graph-environment-chip">domain {env?.domain_id ?? "—"}</span>
        {env?.rmw && <span className="graph-environment-chip">{env.rmw}</span>}
        {env?.workspace && (
          <span className="graph-environment-path" title={env.workspace}>
            {env.workspace}
          </span>
        )}
        <span className="graph-environment-note">
          Cotton's environment · {graph.nodes.length} nodes · {graph.topics.length} topics
        </span>
      </header>
      <GraphView snapshot={graph} />
    </section>
  );
}
