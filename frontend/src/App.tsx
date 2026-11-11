import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { apiGet } from "./api/client";
import type { EnvironmentInfo } from "./api/types";
import { ws } from "./api/ws";
import { StatusBar } from "./layout/StatusBar";
import { Workbench } from "./layout/Workbench";
import { useStore } from "./state/store";

export function App() {
  const { data: env } = useQuery({
    queryKey: ["env"],
    queryFn: () => apiGet<EnvironmentInfo>("/api/env"),
    retry: false,
  });

  useEffect(() => {
    if (env) {
      useStore.getState().setEnv(env);
    }
  }, [env]);

  useEffect(() => {
    const removeEventHandler = ws.onEvent((event) =>
      useStore.getState().applyServerEvent(event),
    );
    const removeStatusHandler = ws.onStatus((connection) =>
      useStore.getState().setConnection(connection),
    );
    ws.subscribe(["graph", "plugins", "processes"]);
    ws.connect();
    return () => {
      removeEventHandler();
      removeStatusHandler();
      ws.close();
    };
  }, []);

  return (
    <div className="app-shell">
      <Workbench />
      <StatusBar />
    </div>
  );
}
