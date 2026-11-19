# ROS Workspace Terminals and Commands — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group terminal sessions by ROS workspace (the colcon workspace you source), and let the user save per-workspace commands that run on demand as quick commands or automatically when a terminal opens.

**Architecture:** Add a `workspaces` domain module (entity, validation, repository port, SQLite adapter) next to the existing terminal session manager. Terminals gain `workspace_id` and `group_id`, so group membership stops being frontend localStorage heuristics and becomes server state. Saved commands are shell text stored per workspace; Cotton writes them into a PTY (never through `shlex`), either on demand in a new tab or as the workspace's startup command.

**Tech Stack:** Python 3.10+, FastAPI, SQLite (existing `Database` with `user_version` migrations); React 19, TypeScript, Zustand, xterm.js.

**Spec:** `docs/workspace-commands.md` (command rules) and `docs/superpowers/specs/2026-11-18-terminal-workspace-design.md` (terminal workspace design this extends).

**Related design note:** `docs/ros-graph-environments.md` (graph keyed by ROS environment; consumes the startup command saved in Task 7).

**Estimates:** the per-task minutes are rough triage, not a commitment. The total (about four hours) is optimistic once migrations, PTY behavior and frontend tests are real; expect slippage rather than cutting tests.

## Global Constraints

- Cotton stays bound to `127.0.0.1`; every new route keeps `Authorization: Bearer` through the existing router dependency.
- No `shell=True` and no string-built shell command lines. Stored command bodies go to a PTY as input; the existing `shlex.split` path for one-off `command` stays exactly as it is.
- Validate everything that reaches the filesystem or a PTY at the API boundary: workspace path, workspace name, group name, command label, command body.
- Domain and application modules import no FastAPI, Pydantic, `sqlite3` or `subprocess`.
- No new backend or frontend dependency.
- Tests first; average backend coverage stays at or above 80%; English for code, comments, commits and docs.
- Conventional Commits, one logical change per commit.

## Decisions

- **Workspace = ROS workspace root.** A workspace is a directory the user registers explicitly: name plus path. The path is canonicalized with `Path.resolve()` and must be an existing directory. Terminals started in a workspace default to that path as `cwd`.
- **No environment capture at registration.** The startup command is the single mechanism that sources `install/setup.bash`: it runs visibly in the shell, is editable, and never persists an environment snapshot to disk. Command terminals started with an argv list keep inheriting Cotton's environment, as today; that limit is recorded in `docs/known-limitations.md`.
- **Groups belong to a workspace and live in the backend.** Every workspace gets a `Default` group on creation. A terminal's group is `spec.group_id`; the frontend derives `terminalIds` from the records instead of storing membership.
- **Saved commands are workspace-scoped only.** Global commands are out of scope for this plan; `docs/workspace-commands.md` is corrected accordingly.
- **Two ways to use a stored command**, matching Orca: `run` starts a new shell tab in the workspace and writes the body, and `insert` writes the body into the active terminal without a newline. `is_startup` is the optional flag that makes a command run in every new shell; at most one per workspace.
- **`localStorage` keeps UI preferences only** (`selectedWorkspaceId`, `selectedGroupId`, `activeTerminalByGroup`, `minimizedIds`), under a `version: 2` shape. The legacy shape is removed on load, not migrated.
- **Graph panels stay keyed by ROS environment, not by workspace.** Two workspaces with the same `ROS_DISTRO`/`ROS_DOMAIN_ID` share one graph; the environment will be derived by a sidecar launched with the workspace startup command. No environment field (`ros_domain_id`, `distro`) is added to the workspace now or later, to avoid duplicating what the startup command already does. Details and phases in `docs/ros-graph-environments.md`; this plan only guarantees that Tasks 7–8 store and expose that startup command.
- **Out of scope:** environment capture, graph panels per environment (`docs/ros-graph-environments.md`), git worktrees, multi-host, global commands, and WebSocket events for workspace/group/command mutations. Other open tabs refetch on workspace switch, so they can briefly show stale groups or commands; the cheap follow-up, if it ever matters, is a per-workspace revision counter the client compares when the window regains focus, not a new event stream.

## Review Focus

- Registering a file, a missing path, a symlink to a file, or the same canonical path twice must be rejected with 422/409 and leave no workspace or default group behind; pin in Tasks 1–2 and 4.
- A command body containing `&&`, `$(...)`, quotes or `source` must reach the shell verbatim and must never be split or interpolated into a Cotton-built command line; pin in Tasks 7–8.
- Deleting a workspace with live terminals, and deleting the last or an occupied group, must return 409 without touching any session; pin in Tasks 4–5.
- A terminal created for workspace A must never render under workspace B, including after a reconnect or when another client created it; pin in Tasks 3, 4 and 6.
- The startup command must run exactly once per new shell, in that terminal's own workspace, and never in a terminal started with an argv command; pin in Task 8.
- A failing startup command must not let the quick command or the requested command run against a half-sourced environment: when both are sent, they are chained with `&&` inside one shell group and written in a single call; pin in Task 8.
- Nothing may be written into a shell before it is ready (slow `.bashrc`, conda, nvm): the initial input is flushed on the first PTY output, with a timeout fallback; pin in Task 8.
- Startup commands and quick commands are stored as typed shell text, so multi-line bodies and quoting must survive verbatim, while the startup command itself is restricted to a single line; pin in Tasks 7–8.
- Marking another command as startup must be an atomic swap inside one transaction, otherwise the partial unique index rejects the second write; pin in Task 7.
- `/api/workspaces/*/commands/*/run` executes shell text, so it must stay behind the same Bearer check as every other route and the server stays on `127.0.0.1`; pin in Task 8.

---

### Task 1 (15 min): Workspace and group domain models

**Files:**
- Create: `backend/src/cotton/workspaces/__init__.py`
- Create: `backend/src/cotton/workspaces/models.py`
- Create: `backend/src/cotton/workspaces/errors.py`
- Test: `backend/tests/test_workspace_models.py`

**Interfaces:**
- Produces `Workspace(id: str, name: str, path: Path, created_at: str)` and `TerminalGroup(id: str, workspace_id: str, name: str, position: int)` as frozen dataclasses.
- Produces `new_workspace(name: str, path: str) -> Workspace` with ids `ws_<uuid4 hex>`, and `new_group(workspace_id: str, name: str, position: int) -> TerminalGroup` with ids `grp_<uuid4 hex>`.
- Produces `validate_name(raw: str) -> str` (strip; 1–64 chars; reject control characters) and `validate_path(raw: str) -> Path` (reject NUL; `Path.resolve()`; must be an existing directory). The returned path is the real path, so a symlink cannot be used to register the same directory under a second name.
- Produces `utc_now() -> str` returning `2026-11-18T10:00:00Z`, the same format `TerminalManager` already uses.
- Produces errors `WorkspaceError(ValueError)`, `InvalidWorkspace(WorkspaceError)`, `WorkspaceNotFound(WorkspaceError)`, `WorkspaceExists(WorkspaceError)`, `GroupNotFound(WorkspaceError)`.
- `to_dict()` on both dataclasses returns `path` as `str` for workspaces.

- [x] **Step 1: Write the failing tests**

```python
def test_workspace_path_is_canonicalized(tmp_path: Path) -> None:
    workspace = new_workspace("ws", str(tmp_path / "."))
    assert workspace.path == tmp_path.resolve()
    assert workspace.id.startswith("ws_")

@pytest.mark.parametrize("path", ["", "/definitely/missing", "/etc/hostname"])
def test_invalid_workspace_paths_are_rejected(path: str) -> None:
    with pytest.raises(InvalidWorkspace):
        new_workspace("ws", path)

@pytest.mark.parametrize("name", ["", "   ", "a" * 65, "bad\x07name"])
def test_invalid_workspace_names_are_rejected(name: str) -> None:
    with pytest.raises(InvalidWorkspace):
        validate_name(name)
```

Add one assertion that `to_dict()` emits `{"path": str(path), ...}` and one that `new_group("ws_1", "Default", 0)` produces `grp_` ids.

- [x] **Step 2: Run the tests and confirm they fail**

Run: `python -m pytest backend/tests/test_workspace_models.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'cotton.workspaces'`.

- [x] **Step 3: Implement the models and errors**

Keep the module free of FastAPI, SQLite and `Path.cwd()`. `validate_path` calls `Path(raw).resolve()` inside `try/except (OSError, RuntimeError)` and raises `InvalidWorkspace` with the offending path in the message.

- [x] **Step 4: Run the tests and confirm they pass**

Run: `python -m pytest backend/tests/test_workspace_models.py -q`
Expected: all pass.

- [x] **Step 5: Commit**

```bash
git add backend/src/cotton/workspaces backend/tests/test_workspace_models.py
git commit -m "feat: add ros workspace domain models"
```

### Task 2 (25 min): Persist workspaces and groups

**Files:**
- Modify: `backend/src/cotton/storage/db.py` (add migration 5)
- Create: `backend/src/cotton/workspaces/repository.py`
- Test: `backend/tests/test_workspace_repository.py`

**Interfaces:**
- Migration 5:

```sql
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);
CREATE TABLE terminal_groups (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL
);
```

- Produces `WorkspaceRepository(Protocol)` with `list() -> list[Workspace]`, `get(workspace_id: str) -> Workspace`, `create(name: str, path: str) -> Workspace`, `rename(workspace_id: str, name: str) -> Workspace`, `delete(workspace_id: str) -> None`, `list_groups(workspace_id: str) -> list[TerminalGroup]`, `get_group(group_id: str) -> TerminalGroup`, `create_group(workspace_id: str, name: str) -> TerminalGroup`, `rename_group(group_id: str, name: str) -> TerminalGroup`, `delete_group(group_id: str) -> None`.
- Produces `SqliteWorkspaceRepository(db: Database)`.
- `create` inserts the workspace and its `Default` group (`position = 0`) in one transaction; a duplicate canonical path raises `WorkspaceExists`; a non-existent `workspace_id` on `create_group` raises `WorkspaceNotFound`. Duplicate detection compares `os.path.normcase(str(path))` so a case-insensitive filesystem cannot be used to bypass the unique index; there is no portable test for the case-folded variant, so it is covered by review and by the `normcase` comparison itself.
- `create_group` appends at `max(position) + 1`; `delete_group` raises `GroupNotFound` when missing; `list_groups` order is `position, name`.

- [x] **Step 1: Write the failing tests**

Use a `Database(tmp_path / "state.db")` with `migrate()` and assert:
- `create("ws", str(tmp_path))` returns a workspace whose `list_groups(...)` is exactly one group named `Default`.
- a second `create` with `str(tmp_path / ".." / tmp_path.name)` raises `WorkspaceExists` and `list()` still has one entry.
- `rename` changes the name; `delete` removes the workspace and its groups (`get_group` raises `GroupNotFound`).
- `get` of an unknown id raises `WorkspaceNotFound`.

- [x] **Step 2: Run the tests and confirm they fail**

Run: `python -m pytest backend/tests/test_workspace_repository.py -q`
Expected: FAIL on the missing table or missing class.

- [x] **Step 3: Implement the migration and repository**

Follow `SettingsRepository`'s use of `Database.connection()`; wrap multi-statement writes in `with connection:` so the workspace and its default group commit together.

- [x] **Step 4: Run the tests and confirm they pass**

Run: `python -m pytest backend/tests/test_workspace_repository.py backend/tests/test_storage.py -q`
Expected: all pass.

- [x] **Step 5: Commit**

```bash
git add backend/src/cotton/storage/db.py backend/src/cotton/workspaces/repository.py backend/tests/test_workspace_repository.py
git commit -m "feat: persist ros workspaces and terminal groups"
```

### Task 3 (30 min): Scope terminal sessions to a workspace and group

**Files:**
- Modify: `backend/src/cotton/terminals/models.py:20-40`
- Modify: `backend/src/cotton/terminals/manager.py:43-98`
- Modify: `backend/src/cotton/api/routes_terminals.py:23-53`
- Modify: `backend/src/cotton/cli.py:56-77`
- Test: `backend/tests/test_terminal_api.py`, `backend/tests/test_terminal_manager.py`
- Modify: `docs/contracts/api.md`

**Interfaces:**
- `TerminalSpec` gains `workspace_id: str` and `group_id: str`, both included by `to_dict()`.
- `TerminalManager.start(argv=None, *, workspace_id: str, group_id: str, cwd: Path | None = None, env: Mapping[str, str] | None = None, initial_input: str | None = None) -> TerminalRecord`; `initial_input` is text typed into the shell once it is ready and is implemented in Task 8. It is not part of `TerminalSpec`.
- `TerminalManager.list(workspace_id: str | None = None) -> list[TerminalRecord]` filters by spec, ordered by `started_at`.
- `TerminalManager.assign(terminal_id: str, group_id: str) -> TerminalRecord` replaces the spec through `dataclasses.replace` and publishes `terminal.state`.
- `POST /api/terminals` body becomes `{"workspace_id": str, "group_id"?: str, "command"?: str | str[], "cwd"?: str, "env"?: object}`. Missing `workspace_id` → `422 workspace_required`; unknown → `404 workspace_not_found`; unknown or foreign `group_id` → `422 group_not_found`. Default `group_id` is the workspace's first group and default `cwd` is the workspace path.
- `GET /api/terminals?workspace_id=<id>` filters; without the parameter it returns every session, unchanged.
- `PATCH /api/terminals/{terminal_id}` body `{"group_id": str}` → `200` record; `404 terminal_not_found`; `422 group_not_found` when the group belongs to another workspace.
- `create_router(manager: TerminalManager, workspaces: WorkspaceRepository) -> APIRouter`; `cli.py` builds `SqliteWorkspaceRepository(database)`, keeps it in a local variable, and passes it to both this router and (Task 4) the workspaces router.

- [x] **Step 1: Write the failing tests**

Update `test_terminal_api.py`'s fixture to create a workspace first. Add tests: create without `workspace_id` returns 422 and spawns nothing; the spawner receives the workspace path as `cwd`; two workspaces produce disjoint `GET /api/terminals?workspace_id=` results; `PATCH` moves a terminal and publishes one `terminal.state`; `PATCH` with another workspace's group returns 422. Add a manager test that `list(workspace_id="...")` filters.

- [x] **Step 2: Run the tests and confirm they fail**

Run: `python -m pytest backend/tests/test_terminal_api.py backend/tests/test_terminal_manager.py -q`
Expected: FAIL on the new `workspace_id` parameter and required field.

- [x] **Step 3: Implement the model, manager and route changes**

Keep `shlex.split` for `command` untouched. Resolve the workspace and group in the route through `WorkspaceRepository` before calling `manager.start`.

- [x] **Step 4: Run the tests and confirm they pass**

Run: `python -m pytest backend/tests/test_terminal_api.py backend/tests/test_terminal_manager.py backend/tests/test_terminal_ws.py -q`
Expected: all pass.

- [x] **Step 5: Document and commit**

```bash
git add backend/src/cotton/terminals backend/src/cotton/api/routes_terminals.py backend/src/cotton/cli.py backend/tests/test_terminal_api.py backend/tests/test_terminal_manager.py docs/contracts/api.md
git commit -m "feat: scope terminal sessions to workspaces and groups"
```

### Task 4 (20 min): Workspace REST API

**Files:**
- Create: `backend/src/cotton/api/routes_workspaces.py`
- Modify: `backend/src/cotton/cli.py` (append the new router using the repository from Task 3)
- Test: `backend/tests/test_workspace_api.py`
- Modify: `docs/contracts/api.md`

**Interfaces:**
- Produces `create_router(repository: WorkspaceRepository, manager: TerminalManager | None = None) -> APIRouter` with:
  - `GET /api/workspaces` → `200 [{"id", "name", "path", "created_at"}]`
  - `POST /api/workspaces` body `{"name": str, "path": str}` → `201` workspace; `422 validation_error`; `409 workspace_exists`
  - `PATCH /api/workspaces/{workspace_id}` body `{"name": str}` → `200`; `404 workspace_not_found`
  - `DELETE /api/workspaces/{workspace_id}` → `200 {"id": str}`; `409 workspace_has_terminals` when any record matches `spec.workspace_id` via `manager.list(workspace_id=workspace_id)`; `404 workspace_not_found`
- Error codes follow `ApiError(status, code, message)`; `WorkspaceError` subclasses are translated in the route, not in the domain.
- With `manager is None` the delete guard is skipped, so the router can be tested from the repository alone.

- [x] **Step 1: Write the failing tests**

Build the client like `test_terminal_api.py` does, appending `create_router(repository, manager)`, and assert: create returns the canonicalized path; duplicate path returns `409 workspace_exists`; a file path returns `422 validation_error`; deleting a workspace with a live fake terminal returns `409 workspace_has_terminals`; an unauthenticated request returns `401`.

- [x] **Step 2: Run the tests and confirm they fail**

Run: `python -m pytest backend/tests/test_workspace_api.py -q`
Expected: FAIL, `404` for `/api/workspaces`.

- [x] **Step 3: Implement the routes and wire them in `cli.py`**

- [x] **Step 4: Run the tests and confirm they pass**

Run: `python -m pytest backend/tests/test_workspace_api.py backend/tests/test_cli.py -q`
Expected: all pass.

- [x] **Step 5: Document and commit**

Add the four routes and their error codes to `docs/contracts/api.md`.

```bash
git add backend/src/cotton/api/routes_workspaces.py backend/src/cotton/cli.py backend/tests/test_workspace_api.py docs/contracts/api.md
git commit -m "feat: expose ros workspaces over the api"
```

### Task 5 (20 min): Terminal group REST API

**Files:**
- Create: `backend/src/cotton/api/routes_terminal_groups.py`
- Modify: `backend/src/cotton/cli.py`
- Test: `backend/tests/test_terminal_group_api.py`
- Modify: `docs/contracts/api.md`

**Interfaces:**
- Produces `create_router(repository: WorkspaceRepository, manager: TerminalManager) -> APIRouter` with:
  - `GET /api/workspaces/{workspace_id}/groups` → `200 [{"id", "workspace_id", "name", "position"}]`
  - `POST /api/workspaces/{workspace_id}/groups` body `{"name": str}` → `201`
  - `PATCH /api/terminal-groups/{group_id}` body `{"name": str}` → `200`
  - `DELETE /api/terminal-groups/{group_id}` → `200 {"id": str}`; `409 group_not_empty` if any record's `spec.group_id` matches; `409 group_is_last` if the workspace has one group
- All errors: `404 workspace_not_found` / `group_not_found`, `422 validation_error`.

- [x] **Step 1: Write the failing tests**

Cover create/rename/delete of an empty group, `409 group_not_empty` with a fake terminal in the group, `409 group_is_last` for the default group, and `404` for an unknown workspace.

- [x] **Step 2: Run the tests and confirm they fail**

Run: `python -m pytest backend/tests/test_terminal_group_api.py -q`
Expected: FAIL, routes not found.

- [x] **Step 3: Implement the router and add it in `cli.py`**

- [x] **Step 4: Run the tests and confirm they pass**

Run: `python -m pytest backend/tests/test_terminal_group_api.py -q`
Expected: all pass.

- [x] **Step 5: Document and commit**

```bash
git add backend/src/cotton/api/routes_terminal_groups.py backend/src/cotton/cli.py backend/tests/test_terminal_group_api.py docs/contracts/api.md
git commit -m "feat: manage terminal groups per workspace"
```

### Task 6 (40 min): Frontend workspace selection with server-backed groups

**Files:**
- Modify: `frontend/src/api/types.ts`
- Create: `frontend/src/features/terminals/workspacesApi.ts`
- Modify: `frontend/src/features/terminals/TerminalWorkspace.tsx`
- Modify: `frontend/src/features/terminals/TerminalGroup.tsx`
- Modify: `frontend/src/features/terminals/TerminalList.tsx`
- Test: `frontend/src/features/terminals/TerminalWorkspace.test.tsx`, `frontend/src/features/terminals/TerminalGroup.test.tsx`

**Interfaces:**
- `api/types.ts` adds `Workspace` and `TerminalGroup` (`id, workspace_id, name, position`) and adds `workspace_id: string`, `group_id: string` to `TerminalSpec`.
- `workspacesApi.ts` exports `listWorkspaces()`, `createWorkspace(name: string, path: string)`, `renameWorkspace(id: string, name: string)`, `deleteWorkspace(id: string)`, `listGroups(workspaceId: string)`, `createGroup(workspaceId: string, name: string)`, `renameGroup(id: string, name: string)`, `deleteGroup(id: string)`, `moveTerminal(terminalId: string, groupId: string)`, all using `apiGet`/`apiSend`.
- `TerminalGroupRecord` (view type in `TerminalGroup.tsx`) keeps `{id, name, terminalIds}`; `TerminalWorkspace` derives it from `listGroups` joined with records whose `spec.group_id` matches, in `started_at` order.
- `TerminalWorkspace` state: `workspaces`, `selectedWorkspaceId`, `groups`, `selectedGroupId`, `activeTerminalByGroup`, `minimizedIds`. Deleted: `addRecordsToGroups` and its selected-group fallback.
- `WORKSPACE_STORAGE_KEY` keeps its name with shape `{version: 2, selectedWorkspaceId, selectedGroupId, activeTerminalByGroup, minimizedIds}`; anything else falls back to defaults, and a legacy value is removed with `localStorage.removeItem` before the first v2 write so the old group membership cannot reappear after a reload.
- Header gains a workspace `<select aria-label="ROS workspace">`, an add form (`name`, `path`, submit "Add workspace"), and "Delete workspace". "New shell" posts `{workspace_id: selectedWorkspaceId, group_id: selectedGroupId}` and is disabled when no workspace exists.

- [x] **Step 1: Write the failing tests**

Mock `apiGet`/`apiSend` as the existing suite does and assert: workspaces render in the select; creating a terminal posts `workspace_id` and `group_id`; switching workspace shows only that workspace's terminals; moving a terminal calls `PATCH /api/terminals/{id}` and does not rewrite local membership; a `version: 1` stored state is discarded; the add form posts the typed name and path.

- [x] **Step 2: Run the tests and confirm they fail**

Run: `cd frontend && npm test -- src/features/terminals/TerminalWorkspace.test.tsx`
Expected: FAIL on the missing workspace select and the new request body.

- [x] **Step 3: Implement the API module and rework `TerminalWorkspace`**

Group creation/renaming/deletion call the API and refetch `listGroups`; keep the existing "no delete when occupied or last" behavior in the UI, backed by the 409s. Reconciliation keeps attaching only terminals of the selected workspace.

- [x] **Step 4: Run the tests and confirm they pass**

Run: `cd frontend && npm test -- src/features/terminals`
Expected: all pass, including the `TerminalBody` and `TerminalGroup` suites.

- [x] **Step 5: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/features/terminals
git commit -m "feat: select ros workspaces and load terminal groups from the api"
```

### Task 7 (25 min): Persist saved workspace commands

**Files:**
- Modify: `backend/src/cotton/storage/db.py` (add migration 6)
- Create: `backend/src/cotton/workspaces/commands.py`
- Test: `backend/tests/test_workspace_commands.py`

**Interfaces:**
- Migration 6:

```sql
CREATE TABLE workspace_commands (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    body TEXT NOT NULL,
    is_startup INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL
);
CREATE UNIQUE INDEX workspace_commands_one_startup
    ON workspace_commands(workspace_id) WHERE is_startup = 1;
```

- Produces `WorkspaceCommand(id: str, workspace_id: str, label: str, body: str, is_startup: bool, position: int)` with `to_dict()`.
- Produces `validate_label(raw: str) -> str` (strip; 1–64 chars; no control characters) and `validate_body(raw: str) -> str` (strip; 1–4096 chars; no NUL) raising `InvalidCommand`. `validate_startup_body(raw: str) -> str` applies the same rules and additionally rejects any `\n`, because the startup command is chained with `&&` and a single-line rule is the only quoting rule that stays predictable.
- Produces errors `CommandNotFound(WorkspaceError)`, `StartupCommandExists(WorkspaceError)`, `InvalidCommand(WorkspaceError)`.
- Produces `CommandRepository(Protocol)` with `list(workspace_id: str) -> list[WorkspaceCommand]`, `get(command_id: str) -> WorkspaceCommand`, `create(workspace_id: str, label: str, body: str, is_startup: bool = False) -> WorkspaceCommand`, `update(command_id: str, label: str, body: str, is_startup: bool) -> WorkspaceCommand`, `delete(command_id: str) -> None`, `startup_for(workspace_id: str) -> WorkspaceCommand | None`.
- `SqliteCommandRepository(db: Database)` validates with `validate_label` and with `validate_startup_body` when `is_startup` is set (`validate_body` otherwise) before writing; a second startup command raises `StartupCommandExists`; ordering is `position, label`.
- `is_startup=False` on update clears the previous startup flag of that workspace in the same transaction. Promoting another command clears the current one first, inside that same transaction, so the partial unique index never sees two startups and the request does not fail with `StartupCommandExists`.

- [x] **Step 1: Write the failing tests**

Assert: create/list/update/delete round trip; `list` is scoped to one workspace; a second startup command created on a workspace that already has one raises `StartupCommandExists`; one `update` moving the flag from command A to command B leaves exactly one startup and does not raise; `startup_for` returns `None` when unset; bodies with `&&`, `$(...)`, quotes and multiple lines are stored verbatim after strip; a startup body containing a newline raises `InvalidCommand`; empty and over-long bodies raise `InvalidCommand`.

- [x] **Step 2: Run the tests and confirm they fail**

Run: `python -m pytest backend/tests/test_workspace_commands.py -q`
Expected: FAIL, module missing.

- [x] **Step 3: Implement the command domain and SQLite repository**

- [x] **Step 4: Run the tests and confirm they pass**

Run: `python -m pytest backend/tests/test_workspace_commands.py backend/tests/test_workspace_repository.py -q`
Expected: all pass.

- [x] **Step 5: Commit**

```bash
git add backend/src/cotton/storage/db.py backend/src/cotton/workspaces/commands.py backend/tests/test_workspace_commands.py
git commit -m "feat: persist saved commands per workspace"
```

### Task 8 (30 min): Command API, startup injection and quick-command runs

**Files:**
- Create: `backend/src/cotton/api/routes_workspace_commands.py`
- Create: `backend/src/cotton/terminals/shell_input.py`
- Modify: `backend/src/cotton/api/routes_terminals.py`
- Modify: `backend/src/cotton/terminals/manager.py`
- Modify: `backend/src/cotton/cli.py`
- Test: `backend/tests/test_workspace_command_api.py`, `backend/tests/test_shell_input.py`
- Modify: `docs/contracts/api.md`

**Interfaces:**
- `create_router(repository: WorkspaceRepository, commands: CommandRepository, manager: TerminalManager) -> APIRouter`:
  - `GET /api/workspaces/{workspace_id}/commands` → `200` command dicts
  - `POST /api/workspaces/{workspace_id}/commands` body `{"label": str, "body": str, "is_startup"?: false}` → `201`
  - `PATCH /api/workspace-commands/{command_id}` body `{"label"?: str, "body"?: str, "is_startup"?: bool}` → `200`
  - `DELETE /api/workspace-commands/{command_id}` → `200 {"id": str}`
  - `POST /api/workspaces/{workspace_id}/commands/{command_id}/run` body `{"group_id"?: str}` → `201` `TerminalRecord`
- Errors: `404 workspace_not_found` / `command_not_found`, `409 startup_command_exists`, `422 validation_error`.
- `manager.start` accepts `initial_input: str | None` and writes it, as UTF-8 plus a trailing newline, only after the shell has produced its first output chunk, or after a `startup_grace_seconds` timeout (default 2 s, injectable for tests) when the shell stays silent. It is never written for `kind == "command"`, never written when the spawn fails, and dropped if the terminal closes first. This keeps a slow `.bashrc` from swallowing the text.
- Produces `compose_initial_input(startup: str | None, body: str | None) -> str | None` in `backend/src/cotton/terminals/shell_input.py`, a pure function: `None` when both are empty; the startup line alone; the body alone; and `startup + " && {\n" + body + "\n}"` when both exist, so a failed `source` stops the body instead of running it against a half-sourced environment.
- `routes_terminals.create_router(manager, workspaces, commands)` looks up `commands.startup_for(workspace_id)` and passes `compose_initial_input(startup.body if startup else None, None)` as `initial_input` for shell terminals.
- The run endpoint starts a shell in the workspace with `initial_input = compose_initial_input(startup_body, command.body)` (one write, no separate body write) and returns the created terminal.
- `/run` requires the Bearer token like every other router route; no new auth path, no `shell=True`, no `shlex` on stored bodies.

- [x] **Step 1: Write the failing tests**

Assert: CRUD round trip; an invalid body returns 422 without touching the manager; the run endpoint spawns one shell and the fake session receives one write, `startup && {\n<body>\n}` followed by a newline, when a startup command exists, and `body` alone otherwise; `POST /api/terminals` in that workspace also injects the startup line; `POST /api/terminals` with `command` does not; `/run` and `POST /api/workspaces` without a token return 401. For the readiness rule, use a fake session that emits a prompt chunk: the write happens only after that chunk, and a silent shell gets the write once the grace timeout expires. Add unit tests for `compose_initial_input` covering both-empty, startup-only, body-only and multi-line body cases.

- [x] **Step 2: Run the tests and confirm they fail**

Run: `python -m pytest backend/tests/test_workspace_command_api.py -q`
Expected: FAIL, routes not found.

- [x] **Step 3: Implement the router, the manager write and the startup lookup**

The body is written as PTY input, never executed through `shlex` or `shell=True`.

- [x] **Step 4: Run the tests and confirm they pass**

Run: `python -m pytest backend/tests/test_shell_input.py backend/tests/test_workspace_command_api.py backend/tests/test_terminal_api.py backend/tests/test_terminal_manager.py -q`
Expected: all pass.

- [x] **Step 5: Document and commit**

```bash
git add backend/src/cotton/api/routes_workspace_commands.py backend/src/cotton/api/routes_terminals.py backend/src/cotton/terminals/shell_input.py backend/src/cotton/terminals/manager.py backend/src/cotton/cli.py backend/tests/test_workspace_command_api.py backend/tests/test_shell_input.py docs/contracts/api.md
git commit -m "feat: run saved workspace commands and inject the startup command"
```

### Task 9 (35 min): Command bar with run, insert and startup flag

**Files:**
- Create: `frontend/src/features/terminals/workspaceCommandsApi.ts`
- Create: `frontend/src/features/terminals/CommandBar.tsx`
- Modify: `frontend/src/features/terminals/TerminalWorkspace.tsx`
- Test: `frontend/src/features/terminals/CommandBar.test.tsx`, `frontend/src/features/terminals/TerminalWorkspace.test.tsx`
- Verify only: `docs/workspace-commands.md`, `docs/known-limitations.md`, `docs/ros-graph-environments.md` (already carry these rules)

**Interfaces:**
- `api/types.ts` adds `WorkspaceCommand` (`id, workspace_id, label, body, is_startup, position`).
- `workspaceCommandsApi.ts` exports `listCommands(workspaceId)`, `createCommand(workspaceId, label, body, isStartup)`, `updateCommand(id, patch)`, `deleteCommand(id)`, `runCommand(workspaceId, commandId, groupId)`.
- `CommandBar` props: `commands`, `onCreate`, `onUpdate`, `onDelete`, `onRun`, `onInsert`, `disabled`. Renders one `li` per command with `Run <label>`, `Insert <label>`, a startup checkbox (`Mark <label> as startup`), edit and delete; a form with `label` and `body` inputs and a `Startup command` checkbox.
- `onInsert` base64-encodes `body` and sends `terminal.input` for the active terminal; it does not send a newline.
- `onRun` calls the API, applies the returned record to the terminal store, and selects it in the current group.
- `TerminalWorkspace` refetches commands on workspace switch and after each mutation.

- [x] **Step 1: Write the failing tests**

`CommandBar.test.tsx`: renders labels; `Run` calls `onRun` with the id; `Insert` calls `onInsert` with the body; the startup checkbox calls `onUpdate(id, {is_startup: true})`; an empty body blocks submit. `TerminalWorkspace.test.tsx`: commands load for the selected workspace; insert sends `terminal.input` with base64 of the body and no trailing newline.

- [x] **Step 2: Run the tests and confirm they fail**

Run: `cd frontend && npm test -- src/features/terminals/CommandBar.test.tsx`
Expected: FAIL, component missing.

- [x] **Step 3: Implement the API module, `CommandBar` and the wiring**

- [x] **Step 4: Run the tests and confirm they pass**

Run: `cd frontend && npm test -- src/features/terminals`
Expected: all pass.

- [x] **Step 5: Check the notes match and commit**

No documentation edit is expected: `docs/workspace-commands.md` already states workspace-only scope, the single-line startup rule and its relation to the graph, and `docs/known-limitations.md` already records that no environment is captured. Change them only if the implementation ended up diverging.

```bash
git add frontend/src/api/types.ts frontend/src/features/terminals
git commit -m "feat: add workspace command bar with quick commands and startup"
```

### Task 10 (20 min): Full verification and task closeout

**Files:**
- Modify: the tracker file referenced by `tasks.md` with the completed blocks
- Test: whole suite

- [x] **Step 1: Run backend checks**

```bash
ruff check backend
ruff format --check backend
mypy backend/src
pytest -m "not integration" --cov=cotton --cov-fail-under=80
```

Expected: all pass; the new modules are covered by the tests added in Tasks 1–8.

- [x] **Step 2: Run frontend checks**

```bash
cd frontend
npm run lint
npm run typecheck
npm test -- --coverage
```

Expected: all pass.

- [x] **Step 3: Record the plan as executed**

Mark the plan's checkboxes and add the completed task blocks with their `Hecho:` evidence to the tracker referenced by `tasks.md`.

- [x] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: record workspace terminals and commands as implemented"
```

## Registro de ejecución

Ejecutado el 2026-11-18 sobre la rama `feat/commands`.

| Tarea | Commit | Evidencia |
| --- | --- | --- |
| 1 Modelos | `33042aa` | `backend/tests/test_workspace_models.py`, 13 tests |
| 2 Persistencia | `f82bd9c` | migración 5 y `test_workspace_repository.py` |
| 3 Scope de terminales | `de4ab7b` | `test_terminal_api.py` y `test_terminal_manager.py` |
| 4 API de workspaces | `5cdc874` | `test_workspace_api.py`, 6 tests |
| 5 API de grupos | `4c5c2d0` | `test_terminal_group_api.py`, 5 tests |
| 6 Frontend de workspaces | `c027024` | `TerminalWorkspace.test.tsx`, `TerminalGroup.test.tsx` |
| 7 Comandos persistidos | `8d5ef5a` | migración 6 y `test_workspace_commands.py` |
| 8 API de comandos y arranque | `3994acf` | `test_workspace_command_api.py`, `test_shell_input.py` |
| 9 Barra de comandos | `823de69` | `CommandBar.test.tsx` y tests de inserción/ejecución |

Verificación final:

```
ruff check backend                          All checks passed
ruff format --check backend                 93 files already formatted
mypy backend/src                            Success: no issues found in 50 source files
pytest -m "not integration" --cov=cotton     294 passed, 6 deselected, 86.82 % coverage
npm run lint / typecheck                    clean
npm test -- --coverage                      168 passed, thresholds reached
```

Divergencias: `TerminalGroup.tsx` no necesitó cambios porque ya recibía los
registros de grupo como vista; el estado guardado pasa a `version: 2` y el
anterior se descarta con `removeItem`.
