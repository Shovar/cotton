import { useState } from "react";

import type { GraphSnapshot, NodeInfo } from "../../api/types";
import { NodeParams } from "./NodeParams";
import { TopicDetail } from "./TopicDetail";

export function GraphView({ snapshot }: { snapshot: GraphSnapshot }) {
  const [search, setSearch] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const needle = search.trim().toLowerCase();
  const nodes = snapshot.nodes.filter((node) => node.name.toLowerCase().includes(needle));
  const topics = snapshot.topics.filter((topic) => topic.name.toLowerCase().includes(needle));
  const services = Object.entries(snapshot.services).filter(([name]) =>
    name.toLowerCase().includes(needle),
  );
  const actions = Object.entries(snapshot.actions).filter(([name]) =>
    name.toLowerCase().includes(needle),
  );
  const topic = snapshot.topics.find((candidate) => candidate.name === selectedTopic);

  return (
    <section className="graph-view" aria-label="Grafo ROS">
      <input
        className="graph-search"
        type="search"
        aria-label="Buscar en el grafo"
        placeholder="Buscar"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="graph-columns">
        <div className="graph-column">
          <h2>Nodos</h2>
          {nodes.length === 0 ? (
            <p>Sin nodos</p>
          ) : (
            namespaces(nodes).map(([namespace, group]) => (
              <section key={namespace}>
                <h3>{namespace}</h3>
                <ul>
                  {group.map((node) => (
                    <li key={node.name}>
                      <button
                        type="button"
                        aria-pressed={selectedNode === node.name}
                        onClick={() => setSelectedNode(node.name)}
                      >
                        {node.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
        <div className="graph-column">
          <h2>Topics</h2>
          {topics.length === 0 ? (
            <p>Sin topics</p>
          ) : (
            <ul>
              {topics.map((candidate) => (
                <li key={candidate.name}>
                  <button
                    type="button"
                    aria-pressed={selectedTopic === candidate.name}
                    onClick={() => setSelectedTopic(candidate.name)}
                  >
                    {candidate.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="graph-columns">
        <div className="graph-column">
          <h2>Servicios</h2>
          {services.length === 0 ? (
            <p>Sin servicios</p>
          ) : (
            <ul>
              {services.map(([name, types]) => (
                <li key={name}>
                  <code>{name}</code> <span>{types.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="graph-column">
          <h2>Acciones</h2>
          {actions.length === 0 ? (
            <p>Sin acciones</p>
          ) : (
            <ul>
              {actions.map(([name, types]) => (
                <li key={name}>
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

function namespaces(nodes: NodeInfo[]): [string, NodeInfo[]][] {
  const groups = new Map<string, NodeInfo[]>();
  for (const node of nodes) {
    const namespace = node.namespace || "/";
    groups.set(namespace, [...(groups.get(namespace) ?? []), node]);
  }
  return [...groups.entries()];
}
