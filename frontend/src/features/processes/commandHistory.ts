const STORAGE_KEY = "ros-studio-command-history";
const LIMIT = 100;

export function loadCommandHistory(storage: Pick<Storage, "getItem"> = localStorage): string[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is string => typeof item === "string" && item.trim() !== "")
      .slice(-LIMIT);
  } catch {
    return [];
  }
}

export function rememberCommand(history: string[], command: string): string[] {
  const trimmed = command.trim();
  if (!trimmed) {
    return history;
  }
  return [...history.filter((item) => item !== trimmed), trimmed].slice(-LIMIT);
}

export function saveCommandHistory(
  history: string[],
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-LIMIT)));
  } catch {
    // Storage can be unavailable or full; the in-memory history still works.
  }
}
