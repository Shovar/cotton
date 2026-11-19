import { Moon, Sun } from "lucide-react";
import { useState } from "react";

import { applyTheme, loadPreferences, savePreferences, type Theme } from "../state/preferences";
import { useStore } from "../state/store";

const THEMES: Theme[] = ["light", "dark"];

export function StatusBar() {
  const env = useStore((state) => state.env);
  const rosConnected = useStore((state) => state.rosConnected);
  const [theme, setTheme] = useState<Theme>(() => loadPreferences().theme);

  const changeTheme = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
    savePreferences({ ...loadPreferences(), theme: next });
  };

  return (
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-card px-3 py-1 text-xs text-muted-foreground">
      <span>ROS {env?.distro ?? "—"}</span>
      <span>Domain {env?.domain_id ?? "—"}</span>
      <span>Workspace {env?.workspace ?? "—"}</span>
      <span
        className={
          rosConnected
            ? "inline-flex items-center gap-1.5 text-success"
            : "inline-flex items-center gap-1.5 text-destructive"
        }
      >
        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
        {rosConnected ? "ROS connected" : "ROS disconnected"}
      </span>
      <div
        className="ml-auto flex items-center gap-0.5 rounded-md border border-border p-0.5"
        role="group"
        aria-label="Theme"
      >
        {THEMES.map((candidate) => {
          const Icon = candidate === "light" ? Sun : Moon;
          return (
            <button
              key={candidate}
              type="button"
              aria-label={candidate === "light" ? "Light theme" : "Dark theme"}
              aria-pressed={theme === candidate}
              onClick={() => changeTheme(candidate)}
              className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground aria-pressed:bg-accent aria-pressed:text-foreground"
            >
              <Icon aria-hidden="true" className="size-3.5" />
            </button>
          );
        })}
      </div>
    </footer>
  );
}
