import { vi } from "vitest";

import { ApiError } from "../api/client";
import type { TerminalRecord, Workspace } from "../api/types";

export interface FakeWorkspaceSeed {
  id: string;
  name: string;
  path?: string;
}

export interface FakeServerSeed {
  workspaces?: FakeWorkspaceSeed[];
  records?: TerminalRecord[];
}

export function terminalRecord(
  id: string,
  workspaceId: string,
  overrides: Partial<TerminalRecord> = {},
): TerminalRecord {
  return {
    spec: {
      id,
      workspace_id: workspaceId,
      group_id: `${workspaceId}_default`,
      kind: "shell",
      argv: ["/bin/sh"],
      cwd: `/tmp/${workspaceId}`,
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
  const workspaces: Workspace[] = (seed.workspaces ?? []).map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    path: workspace.path ?? `/tmp/${workspace.id}`,
    created_at: "2026-11-18T00:00:00Z",
  }));
  const records: TerminalRecord[] = [...(seed.records ?? [])];
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}${++sequence}`;

  const requireWorkspace = (workspaceId: string) => {
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) {
      throw notFound("workspace_not_found", `unknown workspace ${workspaceId}`);
    }
    return workspace;
  };

  const addTerminal = (workspaceId: string) => {
    const record = terminalRecord(nextId("t"), workspaceId);
    records.push(record);
    return record;
  };

  const apiGet = vi.fn(async (path: string): Promise<unknown> => {
    if (path === "/api/workspaces") {
      return [...workspaces];
    }
    if (path === "/api/terminals") {
      return [...records];
    }
    throw new Error(`unexpected GET ${path}`);
  });

  const apiSend = vi.fn(
    async (method: string, path: string, body?: unknown): Promise<unknown> => {
      const payload = (body ?? {}) as Record<string, unknown>;
      const workspacePath = /^\/api\/workspaces\/([^/]+)$/.exec(path);
      const terminalPath = /^\/api\/terminals\/([^/?]+)/.exec(path);

      if (method === "POST" && path === "/api/workspaces") {
        const workspace: Workspace = {
          id: nextId("ws"),
          name: String(payload.name),
          path: String(payload.path),
          created_at: "2026-11-18T00:00:00Z",
        };
        workspaces.push(workspace);
        return workspace;
      }
      if (method === "DELETE" && workspacePath) {
        const workspace = requireWorkspace(decodeURIComponent(workspacePath[1]));
        workspaces.splice(workspaces.indexOf(workspace), 1);
        return { id: workspace.id };
      }
      if (method === "POST" && path === "/api/terminals") {
        return addTerminal(String(payload.workspace_id));
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

  return { apiGet, apiSend, workspaces, records };
}
