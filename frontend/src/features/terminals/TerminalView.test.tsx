import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const terminalMocks = vi.hoisted(() => ({
  instances: [] as Array<{
    cols: number;
    rows: number;
    writes: Uint8Array[];
    emitData: (data: string) => void;
    fit: () => void;
  }>,
  resizeCallbacks: [] as Array<() => void>,
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    writes: Uint8Array[] = [];
    private dataHandler: (data: string) => void = () => {};

    constructor() {
      const instance = {
        cols: this.cols,
        rows: this.rows,
        writes: this.writes,
        emitData: (data: string) => this.dataHandler(data),
        fit: () => {
          this.cols = 100;
          this.rows = 40;
          instance.cols = this.cols;
          instance.rows = this.rows;
        },
      };
      terminalMocks.instances.push(instance);
    }

    loadAddon() {}
    open() {}
    write(data: Uint8Array) {
      this.writes.push(data);
    }
    onData(handler: (data: string) => void) {
      this.dataHandler = handler;
      return { dispose() {} };
    }
    dispose() {}
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {
      terminalMocks.instances.at(-1)?.fit();
    }
    dispose() {}
  },
}));

import { TerminalView } from "./TerminalView";

beforeEach(() => {
  terminalMocks.instances.length = 0;
  terminalMocks.resizeCallbacks.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        terminalMocks.resizeCallbacks.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
});

describe("TerminalView", () => {
  it("writes output bytes to the terminal emulator", () => {
    const output = [{ sequence: 1, data: new Uint8Array([104, 105]) }];
    render(
      <TerminalView
        terminalId="t1"
        onInput={() => {}}
        onResize={() => {}}
        outputChunks={output}
      />,
    );

    expect(terminalMocks.instances[0].writes).toEqual([output[0].data]);
  });

  it("writes only new output chunks when the buffer changes", () => {
    const first = { sequence: 1, data: new Uint8Array([97]) };
    const second = { sequence: 2, data: new Uint8Array([98]) };
    const { rerender } = render(
      <TerminalView
        terminalId="t1"
        onInput={() => {}}
        onResize={() => {}}
        outputChunks={[first]}
      />,
    );

    rerender(
      <TerminalView
        terminalId="t1"
        onInput={() => {}}
        onResize={() => {}}
        outputChunks={[first, second]}
      />,
    );

    expect(terminalMocks.instances[0].writes).toEqual([first.data, second.data]);
  });

  it("forwards typed terminal input", () => {
    const onInput = vi.fn();
    render(
      <TerminalView
        terminalId="t1"
        onInput={onInput}
        onResize={() => {}}
        outputChunks={[]}
      />,
    );

    act(() => terminalMocks.instances[0].emitData("typed"));

    expect(onInput).toHaveBeenCalledWith("typed");
  });

  it("fits and reports terminal dimensions when the panel resizes", () => {
    const onResize = vi.fn();
    render(
      <TerminalView
        terminalId="t1"
        onInput={() => {}}
        onResize={onResize}
        outputChunks={[]}
      />,
    );

    act(() => terminalMocks.resizeCallbacks[0]());

    expect(onResize).toHaveBeenLastCalledWith(100, 40);
  });
});
