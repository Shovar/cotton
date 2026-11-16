import { useMemo } from "react";

import type { GraphSnapshot } from "../../api/types";
import { GRAPH_HEIGHT, GRAPH_WIDTH, layoutGraph, type GraphLink, type GraphPoint } from "./layout";

interface TopicGraphProps {
  snapshot: GraphSnapshot;
  search: string;
  selectedNode: string | null;
  selectedTopic: string | null;
  onSelectNode: (name: string) => void;
  onSelectTopic: (name: string) => void;
}

export function TopicGraph({
  snapshot,
  search,
  selectedNode,
  selectedTopic,
  onSelectNode,
  onSelectTopic,
}: TopicGraphProps) {
  const layout = useMemo(() => layoutGraph(snapshot, search), [snapshot, search]);
  if (layout.points.length === 0) {
    return <p className="graph-empty">No nodes or topics</p>;
  }

  const isSelected = (point: GraphPoint) =>
    point.kind === "node" ? selectedNode === point.label : selectedTopic === point.label;
  const select = (point: GraphPoint) =>
    point.kind === "node" ? onSelectNode(point.label) : onSelectTopic(point.label);

  return (
    <svg
      className="topic-graph"
      role="group"
      aria-label="Nodes and topics graph"
      viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
    >
      <defs>
        <marker
          id="topic-graph-arrow"
          viewBox="0 0 6 6"
          refX="6"
          refY="3"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path className="graph-arrow" d="M0,0 L6,3 L0,6 Z" />
        </marker>
      </defs>
      {layout.links.map((link: GraphLink) => {
        const start = edgePoint(link.from, link.to, pointRadius(link.from));
        const end = edgePoint(link.to, link.from, pointRadius(link.to) + 2);
        return (
          <line
            key={link.id}
            className="graph-link"
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            markerEnd="url(#topic-graph-arrow)"
          />
        );
      })}
      {layout.points.map((point) => (
        <g
          key={point.id}
          className={`graph-point graph-point-${point.kind}`}
          role="button"
          tabIndex={0}
          aria-label={point.label}
          aria-pressed={isSelected(point)}
          onClick={() => select(point)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              select(point);
            }
          }}
        >
          <title>{`${point.kind === "node" ? "Node" : "Topic"} ${point.label}`}</title>
          <circle cx={point.x} cy={point.y} r={pointRadius(point)} />
          <text x={point.x} y={point.y + (point.kind === "node" ? 24 : 20)}>
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function pointRadius(point: GraphPoint): number {
  return point.kind === "node" ? 8 : 5;
}

function edgePoint(from: GraphPoint, to: GraphPoint, radius: number): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(Math.hypot(dx, dy), 1);
  return { x: from.x + (dx / distance) * radius, y: from.y + (dy / distance) * radius };
}
