import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "dockview-react/dist/styles/dockview.css";
import "./styles.css";

import { App } from "./App";
import { readTokenFromHash } from "./api/session";
import "./layout/shellPanels";
import { applyTheme, loadPreferences } from "./state/preferences";

const { hash } = readTokenFromHash(window.location.hash);
if (window.location.hash) {
  history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${hash}`,
  );
}
applyTheme(loadPreferences().theme);

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
