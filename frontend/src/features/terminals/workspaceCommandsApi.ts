import { apiGet, apiSend } from "../../api/client";
import type { TerminalRecord, WorkspaceCommand } from "../../api/types";

export interface CommandPatch {
  label?: string;
  body?: string;
  is_startup?: boolean;
}

function workspacePath(workspaceId: string): string {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/commands`;
}

function commandPath(commandId: string): string {
  return `/api/workspace-commands/${encodeURIComponent(commandId)}`;
}

export function listCommands(workspaceId: string): Promise<WorkspaceCommand[]> {
  return apiGet<WorkspaceCommand[]>(workspacePath(workspaceId));
}

export function createCommand(
  workspaceId: string,
  label: string,
  body: string,
  isStartup: boolean,
): Promise<WorkspaceCommand> {
  return apiSend<WorkspaceCommand>("POST", workspacePath(workspaceId), {
    label,
    body,
    is_startup: isStartup,
  });
}

export function updateCommand(
  commandId: string,
  patch: CommandPatch,
): Promise<WorkspaceCommand> {
  return apiSend<WorkspaceCommand>("PATCH", commandPath(commandId), patch);
}

export function deleteCommand(commandId: string): Promise<{ id: string }> {
  return apiSend<{ id: string }>("DELETE", commandPath(commandId));
}

export function runCommand(
  workspaceId: string,
  commandId: string,
  groupId: string | null,
): Promise<TerminalRecord> {
  return apiSend<TerminalRecord>(
    "POST",
    `${workspacePath(workspaceId)}/${encodeURIComponent(commandId)}/run`,
    groupId ? { group_id: groupId } : {},
  );
}
