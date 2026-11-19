import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub;

/** jsdom has no canvas backend, so drawing is a no-op in tests. */
class CanvasContextStub {
  fillStyle = "";
  strokeStyle = "";
  globalAlpha = 1;
  lineWidth = 1;
  font = "";
  textAlign = "";
  textBaseline = "";

  clearRect() {}
  setTransform() {}
  save() {}
  restore() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  setLineDash() {}
  arc() {}
  fill() {}
  stroke() {}
  fillText() {}
  strokeText() {}
}

HTMLCanvasElement.prototype.getContext = (() =>
  new CanvasContextStub()) as unknown as typeof HTMLCanvasElement.prototype.getContext;
