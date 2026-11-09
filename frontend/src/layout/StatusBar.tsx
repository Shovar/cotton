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
    <footer className="status-bar">
      <span>ROS {env?.distro ?? "—"}</span>
      <span>Dominio {env?.domain_id ?? "—"}</span>
      <span>Workspace {env?.workspace ?? "—"}</span>
      <span className={rosConnected ? "status-ok" : "status-off"}>
        {rosConnected ? "ROS conectado" : "ROS desconectado"}
      </span>
      <div className="theme-switch" role="group" aria-label="Tema">
        {THEMES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={theme === candidate}
            onClick={() => changeTheme(candidate)}
          >
            {candidate === "light" ? "Tema claro" : "Tema oscuro"}
          </button>
        ))}
      </div>
    </footer>
  );
}
