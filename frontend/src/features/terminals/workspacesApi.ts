import { apiGet, apiSend } from "../../api/client";
import type { TerminalGroup, TerminalRecord, Workspace } from "../../api/types";

const WORKSPACES = "/api/workspaces";

function workspacePath(id: string): string {
  return `${WORKSPACES}/${encodeURIComponent(id)}`;
}

function groupPath(id: string): string {
  return `/api/terminal-groups/${encodeURIComponent(id)}`;
}

export function listWorkspaces(): Promise<Workspace[]> {
  return apiGet<Workspace[]>(WORKSPACES);
}

export function createWorkspace(name: string, path: string): Promise<Workspace> {
  return apiSend<Workspace>("POST", WORKSPACES, { name, path });
}

export function renameWorkspace(id: string, name: string): Promise<Workspace> {
  return apiSend<Workspace>("PATCH", workspacePath(id), { name });
}

export function deleteWorkspace(id: string): Promise<{ id: string }> {
  return apiSend<{ id: string }>("DELETE", workspacePath(id));
}

export function listGroups(workspaceId: string): Promise<TerminalGroup[]> {
  return apiGet<TerminalGroup[]>(`${workspacePath(workspaceId)}/groups`);
}

export function createGroup(workspaceId: string, name: string): Promise<TerminalGroup> {
  return apiSend<TerminalGroup>("POST", `${workspacePath(workspaceId)}/groups`, { name });
}

export function renameGroup(id: string, name: string): Promise<TerminalGroup> {
  return apiSend<TerminalGroup>("PATCH", groupPath(id), { name });
}

export function deleteGroup(id: string): Promise<{ id: string }> {
  return apiSend<{ id: string }>("DELETE", groupPath(id));
}

export function moveTerminal(terminalId: string, groupId: string): Promise<TerminalRecord> {
  return apiSend<TerminalRecord>(
    "PATCH",
    `/api/terminals/${encodeURIComponent(terminalId)}`,
    { group_id: groupId },
  );
}
