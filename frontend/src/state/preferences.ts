import darkFaviconUrl from "../assets/ros-studio-favicon-dark.png";
import lightFaviconUrl from "../assets/ros-studio-favicon-light.png";

export type Theme = "light" | "dark";

export interface Preferences {
  theme: Theme;
  layout: unknown | null;
}

export const PREFERENCES_STORAGE_KEY = "ros-studio-preferences";

const DEFAULT_PREFERENCES: Preferences = { theme: "light", layout: null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalize(value: unknown): Preferences {
  if (!isRecord(value)) {
    return { ...DEFAULT_PREFERENCES };
  }
  return {
    theme: value.theme === "dark" ? "dark" : "light",
    layout: isRecord(value.layout) ? value.layout : null,
  };
}

export function loadPreferences(storage: Storage = localStorage): Preferences {
  const raw = storage.getItem(PREFERENCES_STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_PREFERENCES };
  }
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(
  preferences: Preferences,
  storage: Storage = localStorage,
): void {
  storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
}

export function applyTheme(
  theme: Theme,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = theme;
  if (root === document.documentElement) {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (favicon) {
      favicon.href = theme === "dark" ? darkFaviconUrl : lightFaviconUrl;
    }
  }
}
