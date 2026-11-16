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

  it("uses Cotton storage and ignores the ROS Studio key", () => {
    localStorage.setItem(
      "ros-studio-preferences",
      JSON.stringify({ theme: "dark", layout: { grid: {} } }),
    );

    expect(loadPreferences()).toEqual({ theme: "light", layout: null });

    savePreferences({ theme: "dark", layout: null });

    expect(localStorage.getItem("cotton-preferences")).toContain("dark");
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

  it("uses the matching favicon for the selected theme", () => {
    const favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.append(favicon);

    try {
      applyTheme("dark");

      expect(favicon).toHaveAttribute("href", "/src/assets/cotton-favicon-dark.png");
    } finally {
      favicon.remove();
    }
  });

  it("accepts an explicit root", () => {
    const root = document.createElement("div");

    applyTheme("light", root);

    expect(root.dataset.theme).toBe("light");
  });
});
