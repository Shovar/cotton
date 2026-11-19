import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { GraphModel, GraphSelection } from "./model";
import { drawGraph, paletteFromStyles } from "./render";
import {
  DEFAULT_SIMULATION,
  STOP_ALPHA,
  createSimulation,
  pinNode,
  reheat,
  syncSimulation,
  tick,
  unpinNode,
} from "./simulation";
import { fitView, hitTest, panBy, toWorld, zoomAt, type Point, type Viewport } from "./view";

const SYNC_DELAY_MS = 300;
const FALLBACK_SIZE = { width: 960, height: 520 };

interface GraphCanvasProps {
  model: GraphModel;
  selectedId: string | null;
  onSelect: (selection: GraphSelection | null) => void;
}

interface DragState {
  id: string | null;
  from: Point;
  viewport: Viewport;
  pinned: boolean;
}

export function GraphCanvas({ model, selectedId, onSelect }: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [simulation] = useState(() => createSimulation(model));
  const [canvasAvailable, setCanvasAvailable] = useState(true);
  const viewportRef = useRef<Viewport>({
    scale: 1,
    tx: FALLBACK_SIZE.width / 2,
    ty: FALLBACK_SIZE.height / 2,
  });
  const sizeRef = useRef(FALLBACK_SIZE);
  const hoveredRef = useRef<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const fittedRef = useRef("");
  const propsRef = useRef({ model, selectedId });
  const palette = useMemo(
    () =>
      paletteFromStyles((property) =>
        getComputedStyle(document.documentElement).getPropertyValue(property).trim(),
      ),
    [],
  );

  useEffect(() => {
    propsRef.current = { model, selectedId };
  }, [model, selectedId]);

  useEffect(() => {
    const timer = setTimeout(() => syncSimulation(simulation, model), SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [model, simulation]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const previous = sizeRef.current;
      sizeRef.current = { width: rect.width, height: rect.height };
      viewportRef.current = {
        ...viewportRef.current,
        tx: viewportRef.current.tx + (rect.width - previous.width) / 2,
        ty: viewportRef.current.ty + (rect.height - previous.height) / 2,
      };
      fittedRef.current = "";
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      viewportRef.current = zoomAt(viewportRef.current, Math.exp(-event.deltaY * 0.0015), anchor);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) {
        setCanvasAvailable(false);
        return;
      }

      if (simulation.alpha > STOP_ALPHA) {
        tick(simulation, DEFAULT_SIMULATION);
      } else {
        // Once the layout rests, frame it so the graph never opens oversized.
        const key = propsRef.current.model.nodes.map((node) => node.id).join("|");
        if (key && key !== fittedRef.current) {
          fittedRef.current = key;
          const { width, height } = sizeRef.current;
          viewportRef.current = fitView(simulation.nodes.values(), width, height, 64);
        }
      }

      const { width, height } = sizeRef.current;
      const ratio = window.devicePixelRatio || 1;
      const pixelWidth = Math.max(1, Math.round(width * ratio));
      const pixelHeight = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const current = propsRef.current;
      drawGraph(context, current.model, simulation, {
        width,
        height,
        viewport: viewportRef.current,
        hoveredId: hoveredRef.current,
        selectedId: current.selectedId,
        palette,
      });
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [palette, simulation]);

  const pointOf = (event: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const pick = (point: Point): string | null => {
    const targets = propsRef.current.model.nodes.flatMap((node) => {
      const position = simulation.nodes.get(node.id);
      return position ? [{ id: node.id, x: position.x, y: position.y, radius: node.radius }] : [];
    });
    return hitTest(targets, toWorld(point, viewportRef.current));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const from = pointOf(event);
    const id = pick(from);
    dragRef.current = { id, from, viewport: viewportRef.current, pinned: false };
    if (!id) return;
    const node = propsRef.current.model.nodes.find((candidate) => candidate.id === id);
    if (node && (node.kind === "node" || node.kind === "topic")) {
      onSelect({ kind: node.kind, name: node.label });
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointOf(event);
    const drag = dragRef.current;
    if (!drag) {
      hoveredRef.current = pick(point);
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.cursor = hoveredRef.current ? "pointer" : "grab";
      }
      return;
    }
    if (!drag.id) {
      viewportRef.current = panBy(drag.viewport, point.x - drag.from.x, point.y - drag.from.y);
      return;
    }
    if (!drag.pinned) {
      drag.pinned = true;
      // Keep the layout alive so the linked points follow the dragged one.
      reheat(simulation, 0.6);
    }
    const world = toWorld(point, viewportRef.current);
    pinNode(simulation, drag.id, world.x, world.y);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onPointerLeave = () => {
    dragRef.current = null;
    hoveredRef.current = null;
  };

  const onDoubleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const id = pick(pointOf(event));
    if (!id) return;
    unpinNode(simulation, id);
    reheat(simulation, 0.3);
  };

  return (
    <div className="graph-canvas" ref={wrapperRef} role="group" aria-label="Nodes and topics graph">
      <canvas
        ref={canvasRef}
        className="graph-canvas-surface"
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={onDoubleClick}
      />
      {model.nodes.length === 0 && (
        <p className="graph-empty graph-canvas-overlay">No nodes or topics</p>
      )}
      {!canvasAvailable && (
        <p className="graph-empty graph-canvas-overlay">Graph rendering is not available</p>
      )}
      <ul className="graph-items">
        {model.nodes.map((node) => {
          if (node.kind !== "node" && node.kind !== "topic") return null;
          const kind = node.kind;
          return (
            <li key={node.id}>
              <button
                type="button"
                aria-label={node.label}
                aria-pressed={node.id === selectedId}
                onClick={() => onSelect({ kind, name: node.label })}
                onFocus={() => {
                  hoveredRef.current = node.id;
                }}
                onBlur={() => {
                  hoveredRef.current = null;
                }}
              >
                {node.label}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="graph-canvas-hint">Scroll to zoom · drag to pin · double-click to unpin</p>
    </div>
  );
}
