import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import type { GraphSnapshot } from "../../api/types";
import { GraphCanvas } from "./GraphCanvas";
import { buildGraph, type GraphSelection } from "./model";
import { NodeParams } from "./NodeParams";
import { TopicDetail } from "./TopicDetail";

export function GraphView({ snapshot }: { snapshot: GraphSnapshot }) {
  const [search, setSearch] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const needle = search.trim().toLowerCase();
  const services = Object.entries(snapshot.services).filter(([name]) =>
    name.toLowerCase().includes(needle),
  );
  const actions = Object.entries(snapshot.actions).filter(([name]) =>
    name.toLowerCase().includes(needle),
  );
  const topic = snapshot.topics.find((candidate) => candidate.name === selectedTopic);

  const selection = useMemo<GraphSelection | null>(() => {
    if (selectedNode) return { kind: "node", name: selectedNode };
    if (selectedTopic) return { kind: "topic", name: selectedTopic };
    return null;
  }, [selectedNode, selectedTopic]);

  const model = useMemo(() => buildGraph(snapshot, { search }), [snapshot, search]);

  const select = (next: GraphSelection | null) => {
    setSelectedNode(next?.kind === "node" ? next.name : null);
    setSelectedTopic(next?.kind === "topic" ? next.name : null);
  };

  return (
    <section className="graph-view" aria-label="ROS graph">
      <div className="graph-toolbar">
        <Input
          type="search"
          aria-label="Search graph"
          placeholder="Search nodes, topics, services…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <p className="graph-legend">
          <span className="graph-legend-node">Node</span>
          <span className="graph-legend-topic">Topic</span>
          <span className="graph-legend-service">Service</span>
          <span className="graph-legend-action">Action</span>
        </p>
      </div>
      <GraphCanvas
        model={model}
        selectedId={selection ? `${selection.kind}:${selection.name}` : null}
        onSelect={select}
      />
      <div className="graph-columns">
        <div className="graph-column">
          <header className="graph-column-header">
            <h2>Services</h2>
            <span className="graph-count">{services.length}</span>
          </header>
          {services.length === 0 ? (
            <p className="graph-empty-row">No services</p>
          ) : (
            <ul>
              {services.map(([name, types]) => (
                <li key={name} title={types.join(", ")}>
                  <code>{name}</code> <span>{types.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="graph-column">
          <header className="graph-column-header">
            <h2>Actions</h2>
            <span className="graph-count">{actions.length}</span>
          </header>
          {actions.length === 0 ? (
            <p className="graph-empty-row">No actions</p>
          ) : (
            <ul>
              {actions.map(([name, types]) => (
                <li key={name} title={types.join(", ")}>
                  <code>{name}</code> <span>{types.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {topic && <TopicDetail topic={topic} />}
      {selectedNode && <NodeParams key={selectedNode} nodeName={selectedNode} />}
    </section>
  );
}
