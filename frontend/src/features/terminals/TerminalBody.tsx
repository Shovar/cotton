import { Fragment, useEffect, useState } from "react";

import { Minimize2, Plus, SquareTerminal, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { TerminalRecord } from "../../api/types";
import { ws } from "../../api/ws";

import { TerminalView } from "./TerminalView";
import {
  firstPaneId,
  paneIdOf,
  resizeSizes,
  type LayoutNode,
  type PaneNode,
  type PaneSide,
  type SplitNode,
} from "./layout";
import { useTerminalStore, type TerminalOutputChunk } from "./terminalStore";

const EMPTY_OUTPUT_CHUNKS: TerminalOutputChunk[] = [];
const MIN_PANE_PX = 80;

const DOCK_SIDES: PaneSide[] = ["left", "right", "top", "bottom"];

const DOCK_EDGES: Record<PaneSide, string> = {
  left: "inset-y-0 left-0 w-6 border-l-2",
  right: "inset-y-0 right-0 w-6 border-r-2",
  top: "inset-x-0 top-0 h-6 border-t-2",
  bottom: "inset-x-0 bottom-0 h-6 border-b-2",
};

export interface TerminalBodyProps {
  records: TerminalRecord[];
  panes: LayoutNode;
  activeTerminalId: string | null;
  canCreate: boolean;
  onCreate: (paneId: string) => void;
  onMinimize: () => void;
  onSelect: (terminalId: string) => void;
  onClose: (record: TerminalRecord) => void;
  onMove: (terminalId: string, paneId: string, side?: PaneSide) => void;
  onResize: (path: number[], sizes: number[]) => void;
}

interface ResizeStart {
  index: number;
  position: number;
  sizes: number[];
  size: number;
}

interface MosaicHandlers {
  records: Map<string, TerminalRecord>;
  activeTerminalId: string | null;
  actionsPaneId: string;
  canCreate: boolean;
  draggingId: string | null;
  onSelect: (terminalId: string) => void;
  onClose: (record: TerminalRecord) => void;
  onCreate: (paneId: string) => void;
  onMinimize: () => void;
  onDragStart: (terminalId: string) => void;
  onDragEnd: () => void;
  onDropIntoPane: (paneId: string) => void;
  onSplitPane: (paneId: string, side: PaneSide) => void;
  onResize: (path: number[], sizes: number[]) => void;
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

function TerminalPane({ terminalId }: { terminalId: string }) {
  const outputChunks = useTerminalStore(
    (state) => state.outputChunks[terminalId] ?? EMPTY_OUTPUT_CHUNKS,
  );

  return (
    <TerminalView
      terminalId={terminalId}
      outputChunks={outputChunks}
      onInput={(data) =>
        ws.send("terminal.input", { id: terminalId, data: encodeBase64(data) })
      }
      onResize={(cols, rows) =>
        ws.send("terminal.resize", { id: terminalId, cols, rows })
      }
    />
  );
}

function EdgeDrop({ side, onDrop }: { side: PaneSide; onDrop: () => void }) {
  const [active, setActive] = useState(false);

  return (
    <div
      data-dock-side={side}
      aria-hidden="true"
      className={`absolute z-10 ${DOCK_EDGES[side]} ${
        active ? "border-primary" : "border-transparent"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setActive(false);
        onDrop();
      }}
    />
  );
}

function TerminalTab({
  terminalId,
  selected,
  handlers,
}: {
  terminalId: string;
  selected: boolean;
  handlers: MosaicHandlers;
}) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        role="tab"
        draggable
        aria-selected={selected}
        title={terminalId}
        className={`flex h-7 max-w-52 items-center gap-1.5 rounded-md pr-7 pl-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
          selected
            ? "bg-background text-foreground shadow-sm ring-1 ring-border"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
        onClick={() => handlers.onSelect(terminalId)}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", terminalId);
          event.dataTransfer.effectAllowed = "move";
          handlers.onSelect(terminalId);
          handlers.onDragStart(terminalId);
        }}
        onDragEnd={() => handlers.onDragEnd()}
      >
        <SquareTerminal aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate font-mono">{terminalId}</span>
      </button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="absolute top-1/2 right-0.5 size-5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        aria-label={`Close terminal ${terminalId}`}
        title={`Close ${terminalId}`}
        onClick={() => {
          const record = handlers.records.get(terminalId);
          if (record) {
            handlers.onClose(record);
          }
        }}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

function MosaicPane({ pane, handlers }: { pane: PaneNode; handlers: MosaicHandlers }) {
  const visibleId =
    handlers.activeTerminalId && pane.tabs.includes(handlers.activeTerminalId)
      ? handlers.activeTerminalId
      : (pane.tabs[0] ?? null);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-1.5 py-1"
        onDragOver={(event) => {
          if (handlers.draggingId) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          handlers.onDropIntoPane(pane.id);
        }}
      >
        <div
          role="tablist"
          aria-label="Terminals"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        >
          {pane.tabs.map((terminalId) => (
            <TerminalTab
              key={terminalId}
              terminalId={terminalId}
              selected={terminalId === visibleId}
              handlers={handlers}
            />
          ))}
        </div>
        {pane.id === handlers.actionsPaneId && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Minimize terminal"
              title="Minimize terminal"
              disabled={!visibleId}
              onClick={handlers.onMinimize}
            >
              <Minimize2 aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2"
              disabled={!handlers.canCreate}
              onClick={() => handlers.onCreate(pane.id)}
            >
              <Plus aria-hidden="true" />
              New shell
            </Button>
          </div>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {pane.tabs.map((terminalId) => {
          const visible = terminalId === visibleId;
          return (
            <div
              key={terminalId}
              data-terminal-id={terminalId}
              data-terminal-visible={visible}
              aria-hidden={!visible}
              inert={!visible}
              className="absolute inset-0"
              style={{
                opacity: visible ? 1 : 0,
                pointerEvents: visible ? "auto" : "none",
                zIndex: visible ? 1 : 0,
              }}
            >
              <TerminalPane terminalId={terminalId} />
            </div>
          );
        })}
        {handlers.draggingId !== null &&
          DOCK_SIDES.map((side) => (
            <EdgeDrop
              key={side}
              side={side}
              onDrop={() => handlers.onSplitPane(pane.id, side)}
            />
          ))}
        {pane.tabs.length === 0 && (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No terminals in this workspace
          </p>
        )}
      </div>
    </div>
  );
}

function MosaicSplit({
  node,
  path,
  handlers,
}: {
  node: SplitNode;
  path: number[];
  handlers: MosaicHandlers;
}) {
  const [resizeStart, setResizeStart] = useState<ResizeStart | null>(null);
  const horizontal = node.direction === "row";

  useEffect(() => {
    if (!resizeStart) {
      return;
    }
    const handleMove = (event: MouseEvent) => {
      if (resizeStart.size <= 0) {
        return;
      }
      const total = resizeStart.sizes.reduce((sum, value) => sum + value, 0);
      const perPx = total / resizeStart.size;
      const position = horizontal ? event.clientX : event.clientY;
      const minWeight = Math.min(
        MIN_PANE_PX * perPx,
        total / resizeStart.sizes.length / 2,
      );
      handlers.onResize(
        path,
        resizeSizes(
          resizeStart.sizes,
          resizeStart.index,
          (position - resizeStart.position) * perPx,
          minWeight,
        ),
      );
    };
    const handleUp = () => setResizeStart(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [handlers, horizontal, path, resizeStart]);

  return (
    <div
      data-split={node.direction}
      className={`flex min-h-0 min-w-0 flex-1 ${horizontal ? "flex-row" : "flex-col"}`}
    >
      {node.children.map((child, index) => (
        <Fragment key={child.type === "pane" ? child.id : `split-${index}`}>
          {index > 0 && (
            <div
              role="separator"
              aria-orientation={horizontal ? "vertical" : "horizontal"}
              aria-label="Resize terminal panes"
              className={`relative z-20 shrink-0 transition-colors ${
                horizontal
                  ? "w-1.5 cursor-col-resize hover:bg-primary/50"
                  : "h-1.5 cursor-row-resize hover:bg-primary/50"
              } ${resizeStart && resizeStart.index === index - 1 ? "bg-primary" : "bg-border"}`}
              onMouseDown={(event) => {
                const container = event.currentTarget.parentElement;
                if (!container) {
                  return;
                }
                event.preventDefault();
                const rect = container.getBoundingClientRect();
                setResizeStart({
                  index: index - 1,
                  position: horizontal ? event.clientX : event.clientY,
                  sizes: node.sizes,
                  size: horizontal ? rect.width : rect.height,
                });
              }}
            />
          )}
          <div
            className="flex min-h-0 min-w-0 overflow-hidden"
            style={{ flexGrow: node.sizes[index] ?? 1, flexBasis: 0 }}
          >
            <Mosaic node={child} path={[...path, index]} handlers={handlers} />
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function Mosaic({
  node,
  path,
  handlers,
}: {
  node: LayoutNode;
  path: number[];
  handlers: MosaicHandlers;
}) {
  return node.type === "pane" ? (
    <MosaicPane pane={node} handlers={handlers} />
  ) : (
    <MosaicSplit node={node} path={path} handlers={handlers} />
  );
}

export function TerminalBody({
  records,
  panes,
  activeTerminalId,
  canCreate,
  onCreate,
  onMinimize,
  onSelect,
  onClose,
  onMove,
  onResize,
}: TerminalBodyProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const handlers: MosaicHandlers = {
    records: new Map(records.map((record) => [record.spec.id, record])),
    activeTerminalId,
    actionsPaneId: paneIdOf(panes, activeTerminalId) ?? firstPaneId(panes),
    canCreate,
    draggingId,
    onSelect,
    onClose,
    onCreate,
    onMinimize,
    onDragStart: setDraggingId,
    onDragEnd: () => setDraggingId(null),
    onDropIntoPane: (paneId) => {
      if (draggingId) {
        setDraggingId(null);
        onMove(draggingId, paneId);
      }
    },
    onSplitPane: (paneId, side) => {
      if (draggingId) {
        setDraggingId(null);
        onMove(draggingId, paneId, side);
      }
    },
    onResize,
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <Mosaic node={panes} path={[]} handlers={handlers} />
    </section>
  );
}
