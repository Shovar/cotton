import { useEffect, useRef } from "react";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import type { TerminalOutputChunk } from "./terminalStore";

export interface TerminalViewProps {
  terminalId: string;
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  outputChunks: TerminalOutputChunk[];
}

export function TerminalView({
  terminalId,
  onInput,
  onResize,
  outputChunks,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const onInputRef = useRef(onInput);
  const onResizeRef = useRef(onResize);
  const lastWrittenSequenceRef = useRef(0);

  useEffect(() => {
    onInputRef.current = onInput;
    onResizeRef.current = onResize;
  }, [onInput, onResize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "JetBrains Mono Variable",
      fontSize: 14,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    terminalRef.current = terminal;

    const inputSubscription = terminal.onData((data) => onInputRef.current(data));
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      onResizeRef.current(terminal.cols, terminal.rows);
    });
    resizeObserver.observe(container);
    fitAddon.fit();
    onResizeRef.current(terminal.cols, terminal.rows);

    return () => {
      resizeObserver.disconnect();
      inputSubscription.dispose();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [terminalId]);

  useEffect(() => {
    lastWrittenSequenceRef.current = 0;
  }, [terminalId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }
    for (const chunk of outputChunks) {
      if (chunk.sequence > lastWrittenSequenceRef.current) {
        terminal.write(chunk.data);
        lastWrittenSequenceRef.current = chunk.sequence;
      }
    }
  }, [outputChunks, terminalId]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={`Terminal ${terminalId}`}
      className="h-full min-h-0 w-full overflow-hidden p-2"
    />
  );
}
