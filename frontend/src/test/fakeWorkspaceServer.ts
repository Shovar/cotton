import { vi } from "vitest";

import { ApiError } from "../api/client";
import type {
  TerminalGroup,
  TerminalRecord,
  Workspace,
  WorkspaceCommand,
} from "../api/types";

export interface FakeGroupSeed {
  id: string;
  name: string;
}

export interface FakeWorkspaceSeed {
  id: string;
  name: string;
  path?: string;
  groups?: FakeGroupSeed[];
}

export interface FakeServerSeed {
  workspaces?: FakeWorkspaceSeed[];
  records?: TerminalRecord[];
  commands?: WorkspaceCommand[];
}

export function terminalRecord(
  id: string,
  workspaceId: string,
  groupId: string,
  overrides: Partial<TerminalRecord> = {},
): TerminalRecord {
  return {
    spec: {
      id,
      workspace_id: workspaceId,
      group_id: groupId,
      kind: "shell",
      argv: ["/bin/sh"],
      cwd: "/tmp",
      env: {},
    },
    state: "running",
    pid: 10,
    started_at: null,
    exit_code: null,
    error: null,
    ...overrides,
  };
}

function notFound(code: string, message: string): ApiError {
  return new ApiError(code, message, 404);
}

export function createFakeServer(seed: FakeServerSeed = {}) {
  const workspaces: Workspace[] = [];
  const groups: TerminalGroup[] = [];
  const records: TerminalRecord[] = [...(seed.records ?? [])];
  const commands: WorkspaceCommand[] = [...(seed.commands ?? [])];
  const addTerminal = (workspaceId: string, groupId: string, command?: string) => {
    const terminalId = nextId("t");
    const record = terminalRecord(terminalId, workspaceId, groupId, {
      spec: {
        id: terminalId,
        workspace_id: workspaceId,
        group_id: groupId,
        kind: command ? "command" : "shell",
        argv: command ? command.split(" ") : ["/bin/sh"],
        cwd: "/tmp",
        env: {},
      },
    });
    records.push(record);
    return record;
  };
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}${++sequence}`;

  const addGroups = (workspaceId: string, seeds: FakeGroupSeed[]) => {
    for (const [position, group] of seeds.entries()) {
      groups.push({ id: group.id, workspace_id: workspaceId, name: group.name, position });
    }
  };

  for (const workspace of seed.workspaces ?? []) {
    workspaces.push({
      id: workspace.id,
      name: workspace.name,
      path: workspace.path ?? `/tmp/${workspace.id}`,
      created_at: "2026-11-18T00:00:00Z",
    });
    addGroups(
      workspace.id,
      workspace.groups ?? [{ id: `${workspace.id}_default`, name: "Default" }],
    );
  }

  const workspaceGroups = (workspaceId: string) =>
    groups
      .filter((group) => group.workspace_id === workspaceId)
      .sort((left, right) => left.position - right.position);

  const requireWorkspace = (workspaceId: string) => {
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) {
      throw notFound("workspace_not_found", `unknown workspace ${workspaceId}`);
    }
    return workspace;
  };

  const requireGroup = (groupId: string) => {
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group) {
      throw notFound("group_not_found", `unknown group ${groupId}`);
    }
    return group;
  };

  const apiGet = vi.fn(async (path: string): Promise<unknown> => {
    if (path === "/api/workspaces") {
      return [...workspaces];
    }
    if (path === "/api/terminals") {
      return [...records];
    }
    const groupsPath = /^\/api\/workspaces\/([^/]+)\/groups$/.exec(path);
    const commandsPath = /^\/api\/workspaces\/([^/]+)\/commands$/.exec(path);
    if (groupsPath) {
      const workspaceId = decodeURIComponent(groupsPath[1]);
      requireWorkspace(workspaceId);
      return workspaceGroups(workspaceId);
    }
    if (commandsPath) {
      const workspaceId = decodeURIComponent(commandsPath[1]);
      requireWorkspace(workspaceId);
      return commands.filter((command) => command.workspace_id === workspaceId);
    }
    throw new Error(`unexpected GET ${path}`);
  });

  const apiSend = vi.fn(
    async (method: string, path: string, body?: unknown): Promise<unknown> => {
      const payload = (body ?? {}) as Record<string, unknown>;
      const groupsPath = /^\/api\/workspaces\/([^/]+)\/groups$/.exec(path);
      const workspacePath = /^\/api\/workspaces\/([^/]+)$/.exec(path);
      const groupPath = /^\/api\/terminal-groups\/([^/]+)$/.exec(path);
      const createCommandsPath = /^\/api\/workspaces\/([^/]+)\/commands$/.exec(path);
      const runCommandPath = /^\/api\/workspaces\/([^/]+)\/commands\/([^/]+)\/run$/.exec(
        path,
      );
      const commandPath = /^\/api\/workspace-commands\/([^/]+)$/.exec(path);
      const terminalPath = /^\/api\/terminals\/([^/?]+)/.exec(path);

      if (method === "POST" && path === "/api/workspaces") {
        const workspace: Workspace = {
          id: nextId("ws"),
          name: String(payload.name),
          path: String(payload.path),
          created_at: "2026-11-18T00:00:00Z",
        };
        workspaces.push(workspace);
        addGroups(workspace.id, [{ id: nextId("grp"), name: "Default" }]);
        return workspace;
      }
      if (method === "PATCH" && workspacePath) {
        const workspace = requireWorkspace(decodeURIComponent(workspacePath[1]));
        workspace.name = String(payload.name);
        return workspace;
      }
      if (method === "DELETE" && workspacePath) {
        const workspace = requireWorkspace(decodeURIComponent(workspacePath[1]));
        workspaces.splice(workspaces.indexOf(workspace), 1);
        for (const group of workspaceGroups(workspace.id)) {
          groups.splice(groups.indexOf(group), 1);
        }
        return { id: workspace.id };
      }
      if (method === "POST" && groupsPath) {
        const workspaceId = decodeURIComponent(groupsPath[1]);
        requireWorkspace(workspaceId);
        const existing = workspaceGroups(workspaceId);
        const group: TerminalGroup = {
          id: nextId("grp"),
          workspace_id: workspaceId,
          name: String(payload.name),
          position: existing.length,
        };
        groups.push(group);
        return group;
      }
      if (method === "PATCH" && groupPath) {
        const group = requireGroup(decodeURIComponent(groupPath[1]));
        group.name = String(payload.name);
        return group;
      }
      if (method === "DELETE" && groupPath) {
        const group = requireGroup(decodeURIComponent(groupPath[1]));
        if (records.some((record) => record.spec.group_id === group.id)) {
          throw new ApiError("group_not_empty", "group is not empty", 409);
        }
        if (workspaceGroups(group.workspace_id).length < 2) {
          throw new ApiError("group_is_last", "the last group cannot be deleted", 409);
        }
        groups.splice(groups.indexOf(group), 1);
        return { id: group.id };
      }
      if (method === "POST" && path === "/api/terminals") {
        return addTerminal(
          String(payload.workspace_id),
          String(payload.group_id),
          payload.command ? String(payload.command) : undefined,
        );
      }
      if (method === "POST" && createCommandsPath) {
        const workspaceId = decodeURIComponent(createCommandsPath[1]);
        requireWorkspace(workspaceId);
        const command: WorkspaceCommand = {
          id: nextId("cmd"),
          workspace_id: workspaceId,
          label: String(payload.label),
          body: String(payload.body),
          is_startup: Boolean(payload.is_startup),
          position: commands.filter((entry) => entry.workspace_id === workspaceId).length,
        };
        commands.push(command);
        return command;
      }
      if (method === "POST" && runCommandPath) {
        const workspaceId = decodeURIComponent(runCommandPath[1]);
        const command = commands.find(
          (entry) => entry.id === decodeURIComponent(runCommandPath[2]),
        );
        if (!command) {
          throw notFound("command_not_found", "unknown command");
        }
        const groupId =
          typeof payload.group_id === "string"
            ? payload.group_id
            : workspaceGroups(workspaceId)[0].id;
        return addTerminal(workspaceId, groupId);
      }
      if (method === "PATCH" && commandPath) {
        const command = commands.find(
          (entry) => entry.id === decodeURIComponent(commandPath[1]),
        );
        if (!command) {
          throw notFound("command_not_found", "unknown command");
        }
        Object.assign(command, payload);
        return command;
      }
      if (method === "DELETE" && commandPath) {
        const commandId = decodeURIComponent(commandPath[1]);
        const index = commands.findIndex((entry) => entry.id === commandId);
        if (index < 0) {
          throw notFound("command_not_found", "unknown command");
        }
        commands.splice(index, 1);
        return { id: commandId };
      }
      if (method === "PATCH" && terminalPath) {
        const record = records.find(
          (candidate) => candidate.spec.id === decodeURIComponent(terminalPath[1]),
        );
        if (!record) {
          throw notFound("terminal_not_found", "unknown terminal");
        }
        record.spec = { ...record.spec, group_id: String(payload.group_id) };
        return record;
      }
      if (method === "DELETE" && terminalPath) {
        const terminalId = decodeURIComponent(terminalPath[1]);
        const index = records.findIndex((candidate) => candidate.spec.id === terminalId);
        if (index < 0) {
          throw notFound("terminal_not_found", "unknown terminal");
        }
        return records.splice(index, 1)[0];
      }
      throw new Error(`unexpected ${method} ${path}`);
    },
  );

  return { apiGet, apiSend, workspaces, groups, records, commands };
}
