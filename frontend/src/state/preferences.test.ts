import { afterEach, describe, expect, it } from "vitest";

import {
  applyTheme,
  loadPreferences,
  PREFERENCES_STORAGE_KEY,
  savePreferences,
} from "./preferences";

afterEach(() => {
  localStorage.clear();
});

describe("preferences", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadPreferences()).toEqual({ theme: "light", layout: null });
  });

  it("persists theme and layout", () => {
    savePreferences({ theme: "dark", layout: { grid: {} } });

    expect(loadPreferences()).toEqual({ theme: "dark", layout: { grid: {} } });
    expect(localStorage.getItem(PREFERENCES_STORAGE_KEY)).toContain("dark");
  });

  it("ignores corrupt JSON", () => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, "{not json");

    expect(loadPreferences()).toEqual({ theme: "light", layout: null });
  });

  it("normalizes unknown values", () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ theme: "neon", layout: "broken" }),
    );

    expect(loadPreferences()).toEqual({ theme: "light", layout: null });
  });

  it("ignores non-object preference roots", () => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(["dark"]));

    expect(loadPreferences()).toEqual({ theme: "light", layout: null });
  });
});

describe("applyTheme", () => {
  it("sets data-theme on the document element", () => {
    applyTheme("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("accepts an explicit root", () => {
    const root = document.createElement("div");

    applyTheme("light", root);

    expect(root.dataset.theme).toBe("light");
  });
});
