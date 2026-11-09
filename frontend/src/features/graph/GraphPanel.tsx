import { useQuery } from "@tanstack/react-query";

import { apiGet } from "../../api/client";
import type { GraphSnapshot } from "../../api/types";
import { useStore } from "../../state/store";
import { GraphView } from "./GraphView";

export function GraphPanel() {
  const graph = useStore((state) => state.graph);
  useQuery({
    queryKey: ["graph"],
    queryFn: async () => {
      const snapshot = await apiGet<GraphSnapshot>("/api/graph");
      useStore.getState().setGraph(snapshot);
      return snapshot;
    },
  });

  if (!graph) {
    return <p className="graph-empty">Esperando el grafo…</p>;
  }
  return <GraphView snapshot={graph} />;
}
