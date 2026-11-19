import { apiGet, apiSend } from "../../api/client";
import type { Workspace } from "../../api/types";

const WORKSPACES = "/api/workspaces";

export function listWorkspaces(): Promise<Workspace[]> {
  return apiGet<Workspace[]>(WORKSPACES);
}

export function createWorkspace(name: string, path: string): Promise<Workspace> {
  return apiSend<Workspace>("POST", WORKSPACES, { name, path });
}

export function deleteWorkspace(id: string): Promise<{ id: string }> {
  return apiSend<{ id: string }>("DELETE", `${WORKSPACES}/${encodeURIComponent(id)}`);
}
