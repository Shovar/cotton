# Cotton Terminal Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local web terminal workspace with PTY-backed sessions, groups, tabs, resizable mosaics, and live status.

**Architecture:** Keep Cotton's React/FastAPI application and `dockview`; add a backend terminal-session manager using POSIX PTYs and a small exec helper, separate from `ProcessManager`. Use the existing authenticated `/ws` connection for terminal input, resize, state, output, and replay; persist frontend group/layout state in `localStorage`.

**Tech Stack:** Python 3.10+, FastAPI, asyncio and POSIX stdlib (`pty`, `termios`, `fcntl`); React 19, TypeScript, Vite, Zustand, dockview, xterm.js.

**Spec:** `docs/superpowers/specs/2026-11-18-terminal-workspace-design.md`

## Global Constraints

- `Cotton remains bound to loopback by default.`
- All terminal APIs and WebSocket channels use Cotton's existing session-token and WebSocket `Origin` checks.
- `The implementation must respect the project's supported local environments (Linux, WSL2 and Docker; macOS is used for development).`
- `It must not add recovery infrastructure or require a separately installed multiplexer.`
- No replacement of `ProcessManager` for profile/plugin-managed processes.
- Code, comments, commit messages and documentation are written in English.
- Backend dependencies remain unchanged; add only the terminal-emulator frontend packages needed for VT behavior.

## Review Focus

- Empty argv, NULs, malformed env entries, and a missing/non-directory cwd must return actionable validation errors without spawning a child; pin in Task 6.
- A wrong token, disallowed/missing WebSocket Origin, or control message for an unknown session must never expose or control a terminal; pin in Tasks 6–7.
- Invalid terminal dimensions and fragmented/partial PTY output must not corrupt state or raise an uncaught error; pin in Tasks 4–5.
- A disconnected frontend must not stop a PTY, and replay must be bounded and ordered; pin in Tasks 4 and 14.
- Closing a shell with a foreground job must confirm before termination; idle-shell and direct-command close behavior must follow the approved policy; pin in Tasks 5 and 10.

---

### Task 1 (10 min): Define terminal models and wire contract

**Files:**
- Create: `backend/src/cotton/terminals/__init__.py`
- Create: `backend/src/cotton/terminals/models.py`
- Test: `backend/tests/test_terminal_models.py`
- Modify: `docs/contracts/api.md`

**Interfaces:**
- Produces `TerminalState` values `starting`, `running`, `exited`, `failed`.
- Produces immutable `TerminalSpec(id: str, kind: Literal["shell", "command"], argv: tuple[str, ...], cwd: Path, env: Mapping[str, str])`.
- Produces `TerminalRecord(spec: TerminalSpec, state: TerminalState, pid: int | None, started_at: str | None, exit_code: int | None, error: str | None)`.
- Produces `TerminalChunk(sequence: int, data: bytes)` for bounded output replay.
- REST contract: `GET /api/terminals`, `POST /api/terminals`, `DELETE /api/terminals/{id}`. Create body is `{"command"?: string | string[], "cwd"?: string, "env"?: object}`; omitted `command` starts the default shell. A string is parsed with `shlex.split`; no shell evaluates it.
- WebSocket contract: subscribe to `terminals`; `terminal.attach` carries `id` and `after_sequence`, `terminal.detach` carries `id`, `terminal.input` carries base64 `data`, and `terminal.resize` carries positive `cols`/`rows`. Server events are `terminal.state` and base64 `terminal.output` with monotonically increasing `sequence`.
- `DELETE /api/terminals/{id}?force=false` returns 409 `terminal_busy` when a command is active unless `force=true`; the UI confirms before retrying with `force=true`.

- [ ] **Step 1: Write failing model tests** for the four states, stable JSON serialization, and output sequence/data preservation.
- [ ] **Step 2: Run `pytest backend/tests/test_terminal_models.py -q`**; confirm the new imports fail.
- [ ] **Step 3: Implement the dataclasses and enum** in `models.py`; keep framework/API models out of this module.
- [ ] **Step 4: Run the model tests** and confirm they pass; document the REST and WebSocket shapes in `api.md`.
- [ ] **Step 5: Commit** as `feat: define terminal session contract`.

### Task 2 (15 min): Implement the POSIX PTY adapter

**Files:**
- Create: `backend/src/cotton/terminals/ports.py`
- Create: `backend/src/cotton/terminals/posix.py`
- Create: `backend/src/cotton/terminals/pty_exec.py`
- Test: `backend/tests/test_terminal_pty_exec.py`

**Interfaces:**
- `async PtySpawner.spawn(argv: Sequence[str], cwd: Path, env: Mapping[str, str]) -> PtySession`.
- `PtySession` exposes `pid`, `async read() -> bytes | None`, `async write(data: bytes) -> None`, `async resize(cols: int, rows: int) -> None`, `has_foreground_job() -> bool`, and `async close() -> int`.
- `main(argv: list[str] | None = None) -> int` attaches fd 0 to the controlling terminal and replaces itself with the requested argv via `os.execvpe`.
- `PosixPtySpawner` starts the helper with `asyncio.create_subprocess_exec(..., start_new_session=True)` and the PTY slave on stdin/stdout/stderr. Do not use `shell=True` or `preexec_fn`.

- [ ] **Step 1: Write a POSIX `integration`-marked test** that starts the adapter with a Python child which reports `isatty(0/1/2)`, reads input, and reports its foreground process group; skip cleanly when PTY APIs are unavailable.
- [ ] **Step 2: Run `pytest backend/tests/test_terminal_pty_exec.py -q`**; confirm the test fails because the adapter/helper is absent.
- [ ] **Step 3: Implement the adapter and helper** using `TIOCSCTTY`, `TIOCSWINSZ`, nonblocking master-fd reads, and `os.execvpe`; return an explicit failure when no executable is provided.
- [ ] **Step 4: Run the integration test** and assert all three descriptors are TTYs and child input/output round-trips.
- [ ] **Step 5: Commit** as `feat: add safe PTY exec helper`.

### Task 3 (15 min): Start sessions and publish state/output

**Files:**
- Create: `backend/src/cotton/terminals/manager.py`
- Test: `backend/tests/test_terminal_manager.py`

**Interfaces:**
- `TerminalManager(bus: EventBus, spawner: PtySpawner, scrollback_bytes: int = 65536)`.
- `async start(argv: Sequence[str] | None = None, *, cwd: Path | None = None, env: Mapping[str, str] | None = None) -> TerminalRecord`.
- `list() -> list[TerminalRecord]`, `get(terminal_id: str) -> TerminalRecord`.
- `output_since(terminal_id: str, sequence: int) -> list[TerminalChunk]`.
- Session IDs use `t_` plus a UUID hex string. Default shell is executable `$SHELL`, falling back to `/bin/sh`; inherit Cotton's environment and cwd unless overridden.
- Publish `terminal.state` and `terminal.output` events through the existing `EventBus`; retain at most 64 KiB of output per session.

- [ ] **Step 1: Write failing tests using a fake `PtySpawner`** for shell default, explicit argv, `starting → running → exited`, spawn failure, exit code, and output sequence ordering.
- [ ] **Step 2: Run the focused tests**; confirm the manager module is missing.
- [ ] **Step 3: Implement state tracking, fakeable session ownership, and the async output reader**; production PTY allocation remains in `PosixPtySpawner`.
- [ ] **Step 4: Run the tests** and assert a fake session that writes then exits produces an exited record and ordered output events.
- [ ] **Step 5: Commit** as `feat: start PTY terminal sessions`.

### Task 4 (10 min): Bound and replay terminal output

**Files:**
- Modify: `backend/src/cotton/terminals/manager.py`
- Modify: `backend/tests/test_terminal_manager.py`

**Interfaces:**
- `output_since(terminal_id: str, sequence: int) -> list[TerminalChunk]` returns retained chunks newer than `sequence`, oldest first.
- The buffer is per session and capped at `scrollback_bytes`; evicted data is not replayed.

- [ ] **Step 1: Write a failing test** that emits more than 64 KiB and verifies the replay buffer retains only the newest bytes with increasing sequence numbers.
- [ ] **Step 2: Run the focused test** and confirm it fails on unbounded/no replay output.
- [ ] **Step 3: Implement a bounded per-session byte buffer** and `output_since`.
- [ ] **Step 4: Run manager tests** and confirm replay ordering and the byte limit.
- [ ] **Step 5: Commit** as `feat: bound and replay terminal output`.

### Task 5 (15 min): Forward input, resize, and stop sessions

**Files:**
- Modify: `backend/src/cotton/terminals/manager.py`
- Modify: `backend/src/cotton/terminals/posix.py`
- Modify: `backend/tests/test_terminal_manager.py`
- Test: `backend/tests/test_terminal_pty_exec.py`

**Interfaces:**
- `async write_input(terminal_id: str, data: bytes) -> None`.
- `async resize(terminal_id: str, cols: int, rows: int) -> None`; accept dimensions from 1 through 1000 inclusive.
- `has_foreground_job(terminal_id: str) -> bool` compares the PTY foreground process group with the shell process group where supported.
- `async close(terminal_id: str, force: bool = False) -> TerminalRecord`; `async shutdown() -> None`.
- Raise `TerminalBusy` unless `force=True` when a direct command is still running or the shell has a foreground job; if foreground-job detection is unavailable, treat a live shell as busy.

- [ ] **Step 1: Write failing tests** for input echo, PTY window-size changes, invalid dimensions, unknown IDs, idle-shell close, active-command `TerminalBusy`, forced close, and shutdown of every live session.
- [ ] **Step 2: Run the focused tests** and confirm input/resize/close are not implemented.
- [ ] **Step 3: Implement master-fd writes, `TIOCSWINSZ`, and conservative foreground-job detection**; implement PTY process-group termination in `PosixPtySession.close()` by sending SIGHUP, waiting up to 3 seconds, then sending SIGKILL if still alive.
- [ ] **Step 4: Run the tests** and verify no child process group remains after forced close/shutdown.
- [ ] **Step 5: Commit** as `feat: control and stop PTY sessions`.

### Task 6 (15 min): Add terminal REST routes and lifecycle wiring

**Files:**
- Create: `backend/src/cotton/api/routes_terminals.py`
- Test: `backend/tests/test_terminal_api.py`
- Modify: `backend/src/cotton/services.py`
- Modify: `backend/src/cotton/cli.py`

**Interfaces:**
- `create_router(manager: TerminalManager) -> APIRouter`.
- `GET /api/terminals` returns `TerminalRecord[]`; `POST /api/terminals` returns 201; `DELETE /api/terminals/{id}` closes the session.
- Create accepts `command` as a non-empty string or string list, optional existing directory `cwd`, and optional string-to-string `env`; parse a string with `shlex.split`, reject NULs and invalid environment keys, and never evaluate it in a shell.
- Delete accepts `force: bool = false`; map `TerminalBusy` to 409 `terminal_busy` unless forced.
- `Services.terminal_manager` is set by `build_services`; `manager.shutdown` is registered in the app shutdown hooks.

- [ ] **Step 1: Write failing API tests** for list/create/close, default shell, shlex parsing without shell evaluation, invalid command/env/cwd, missing bearer 401, `terminal_busy` 409, forced close, and unknown-session 404.
- [ ] **Step 2: Run `pytest backend/tests/test_terminal_api.py -q`**; confirm the router and wiring are absent.
- [ ] **Step 3: Implement DTO validation, router construction, `Services` wiring, and CLI startup/shutdown registration**.
- [ ] **Step 4: Run API tests** and verify malformed requests return the standard `{code, message}` envelope without spawning.
- [ ] **Step 5: Commit** as `feat: expose terminal session REST API`.

### Task 7 (15 min): Extend authenticated WebSocket for terminal control

**Files:**
- Modify: `backend/src/cotton/api/ws.py`
- Modify: `backend/src/cotton/api/routes_terminals.py`
- Modify: `backend/src/cotton/cli.py`
- Test: `backend/tests/test_terminal_ws.py`
- Modify: `docs/contracts/api.md`

**Interfaces:**
- Register `terminals` for initial session state and a dynamic `terminal:<id>` channel for buffered output and live events.
- `terminal.attach` validates the ID, subscribes to live output before taking a replay snapshot, sends current state, and replays chunks after `after_sequence`. Suppress queued live chunks at or below the replay high-water sequence to prevent gaps and duplicates. `terminal.detach` unsubscribes output without stopping the PTY.
- Accept `terminal.input` and `terminal.resize` only for attached, known sessions; decode base64 strictly and return standard WebSocket error events for invalid payloads.
- Require the existing token/Origin handshake before any terminal control or output.

- [ ] **Step 1: Write failing WebSocket tests** for attach/replay/detach, input, resize, another authorized client attaching to the same session, wrong token, missing/disallowed Origin, invalid base64, unknown session, and unattached control.
- [ ] **Step 2: Run `pytest backend/tests/test_terminal_ws.py -q`** and confirm terminal messages are rejected as unsupported.
- [ ] **Step 3: Implement channel registration and attach/detach/input/resize handlers** in the existing `/ws` endpoint.
- [ ] **Step 4: Run the tests** and verify rejected clients cannot receive output or control a session.
- [ ] **Step 5: Commit** as `feat: stream terminal sessions over authenticated websocket`.

### Task 8 (10 min): Add frontend terminal protocol types and WebSocket sending

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/ws.ts`
- Test: `frontend/src/api/ws.test.ts`
- Create: `frontend/src/features/terminals/terminalStore.ts`
- Test: `frontend/src/features/terminals/terminalStore.test.ts`

**Interfaces:**
- Add `TerminalRecord`, terminal event, and terminal control message types matching Task 1.
- Add `WsClient.send(type: string, data: Record<string, unknown>): boolean`; it sends only while the socket is open and never queues stale keystrokes across reconnects.
- The terminal store tracks records, per-session last sequence, visible attachments, and connection status; on reconnect it reattaches visible sessions after their last sequence.

- [ ] **Step 1: Write failing tests** for terminal event reduction, reattach after reconnect, base64 decoding, and input send behavior while open/closed.
- [ ] **Step 2: Run `npm test -- frontend/src/api/ws.test.ts frontend/src/features/terminals/terminalStore.test.ts`** and confirm missing types/actions.
- [ ] **Step 3: Implement types, `WsClient.send`, and the feature-owned store slice** without changing `Workbench.tsx`.
- [ ] **Step 4: Run the focused Vitest tests** and confirm closed sockets do not queue input.
- [ ] **Step 5: Commit** as `feat: add terminal websocket client state`.

### Task 9 (15 min): Render an interactive terminal panel

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/src/features/terminals/TerminalView.tsx`
- Test: `frontend/src/features/terminals/TerminalView.test.tsx`

**Interfaces:**
- `TerminalView({ terminalId, onInput, onResize, outputChunks }: TerminalViewProps)`.
- Use `@xterm/xterm` for VT rendering and `@xterm/addon-fit` for fitting the PTY to the panel; reuse the current JetBrains Mono font.

- [ ] **Step 1: Write failing component tests** for rendering output, forwarding typed input, and sending rows/columns after a panel resize.
- [ ] **Step 2: Run the focused Vitest test** and confirm the component/dependencies are absent.
- [ ] **Step 3: Run `npm install @xterm/xterm @xterm/addon-fit`, then implement the terminal component**; do not add another layout or state library.
- [ ] **Step 4: Run the focused test and `npm run typecheck`**.
- [ ] **Step 5: Commit** as `feat: render interactive terminal panels`.

### Task 10 (15 min): Create and manage terminal sessions in the UI

**Files:**
- Create: `frontend/src/features/terminals/TerminalWorkspace.tsx`
- Create: `frontend/src/features/terminals/TerminalList.tsx`
- Create: `frontend/src/features/terminals/register.ts`
- Test: `frontend/src/features/terminals/TerminalWorkspace.test.tsx`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Register one `TerminalWorkspace` panel using `registerPanel()`; do not edit `frontend/src/layout/Workbench.tsx`.
- Create shell sessions with no command, or command sessions with `command` as a string or argv list; append the returned record to the terminal store.
- Closing calls `DELETE /api/terminals/{id}`; if it receives 409 `terminal_busy`, ask for confirmation and retry with `force=true`. Idle shell close does not prompt.
- Terminal list shows `starting`, `running`, `exited`, and `failed`; display exit code when present.

- [ ] **Step 1: Write failing UI tests** for creating a shell, creating a command session, status changes, retrying after `terminal_busy`, no prompt for an idle shell, and not force-closing when confirmation is cancelled.
- [ ] **Step 2: Run the focused Vitest test** and confirm the workspace is absent.
- [ ] **Step 3: Implement the workspace, list, create/close controls, and feature registration**.
- [ ] **Step 4: Run the focused tests and `npm run typecheck`**.
- [ ] **Step 5: Commit** as `feat: add terminal workspace controls`.

### Task 11 (15 min): Manage named terminal groups

**Files:**
- Modify: `frontend/src/features/terminals/TerminalWorkspace.tsx`
- Create: `frontend/src/features/terminals/TerminalGroup.tsx`
- Test: `frontend/src/features/terminals/TerminalGroup.test.tsx`

**Interfaces:**
- Each group has an id, name, terminal IDs, and a selected state.
- Users can create and rename groups, move a terminal to another group, and delete an empty group; new terminals go to the selected group.

- [ ] **Step 1: Write failing group tests** for create, rename, move, deleting an empty group, and rejecting deletion of a non-empty group.
- [ ] **Step 2: Run the focused Vitest test** and confirm group operations are absent.
- [ ] **Step 3: Implement group state and sidebar controls**; new sessions use the selected group.
- [ ] **Step 4: Run the tests and `npm run typecheck`**.
- [ ] **Step 5: Commit** as `feat: manage terminal groups`.

### Task 12 (15 min): Add tabbed and mosaic group layouts

**Files:**
- Modify: `frontend/src/features/terminals/TerminalWorkspace.tsx`
- Modify: `frontend/src/features/terminals/TerminalGroup.tsx`
- Test: `frontend/src/features/terminals/TerminalGroup.test.tsx`

**Interfaces:**
- Use a nested dockview per named group. Dockview's tab-strip and edge-drop behavior moves terminal panels between tabs and split panes; its splitters resize adjacent panes.
- A group can keep terminals in the tab strip while displaying other terminals in a tiled split.

- [ ] **Step 1: Write failing layout tests** for tab retention, edge-drop split, mixed tabs/mosaic, and resizing one pane while its neighbor adapts.
- [ ] **Step 2: Run the focused Vitest test** and confirm mixed docking is absent.
- [ ] **Step 3: Implement nested dockview layouts** using the already-installed dockview packages.
- [ ] **Step 4: Run the tests** and verify drag/drop moves a terminal without changing its session ID.
- [ ] **Step 5: Commit** as `feat: organize terminal groups with dock layouts`.

### Task 13 (10 min): Minimize, restore, and persist the layout

**Files:**
- Modify: `frontend/src/features/terminals/TerminalWorkspace.tsx`
- Test: `frontend/src/features/terminals/TerminalWorkspace.test.tsx`

**Interfaces:**
- Minimize removes a panel from the visible dock layout without calling the delete API; restore uses the same session ID.
- Persist group names, membership, minimized IDs, and dockview layouts under one terminal feature `localStorage` key.

- [x] **Step 1: Write failing tests** for minimize-without-stop, restoring the same session, reload persistence, and stale-ID cleanup.
- [x] **Step 2: Run the focused Vitest test** and confirm minimize/layout state is not preserved.
- [x] **Step 3: Implement minimize/restore and feature-owned `localStorage` serialization**.
- [x] **Step 4: Run the tests** and verify minimizing never calls `DELETE /api/terminals/{id}`.
- [x] **Step 5: Commit** as `feat: persist terminal group layouts`.

### Task 14 (15 min): Reattach and replay after WebSocket reconnect

**Files:**
- Modify: `frontend/src/features/terminals/terminalStore.ts`
- Modify: `backend/src/cotton/api/ws.py`
- Test: `frontend/src/features/terminals/terminalStore.test.ts`
- Test: `backend/tests/test_terminal_ws.py`

**Interfaces:**
- On initial frontend load or WebSocket reconnect while the same Cotton backend process is alive, reconcile `GET /api/terminals` with the saved layout and attach visible sessions. Use sequence 0 after page reload and the last received sequence after a transient WebSocket disconnect. Backend restart still ends sessions and has no recovery path.
- `terminal.attach` replays output newer than `after_sequence`; `terminal.detach` stops forwarding output only and never terminates the PTY.

- [x] **Step 1: Write failing tests** for restored sessions after page reload, ordered replay after transient reconnect, no replay of already-received chunks (including a live event racing with replay), and detached sessions remaining alive.
- [x] **Step 2: Run the focused backend and frontend tests** and confirm reconnect replay is missing.
- [x] **Step 3: Implement session reconciliation and attach/detach replay**.
- [x] **Step 4: Run both focused test files** and confirm output has no gaps or duplicate sequence writes.
- [x] **Step 5: Commit** as `feat: reattach terminal sessions after websocket reconnect`.

### Task 15 (15 min): Verify the complete terminal flow and document behavior

**Files:**
- Create: `frontend/e2e/terminals.spec.ts`
- Modify: `README.md`

**Interfaces:**
- E2E covers creating two terminals, typing into an interactive shell, opening a command session, grouping, splitting/resizing, minimizing/restoring, and closing with confirmation.
- Document that terminals are local shell access, inherit Cotton's environment, and do not survive a backend restart.

- [x] **Step 1: Write the Playwright flow** against the local app and verify it fails before the complete feature is wired.
- [x] **Step 2: Run `npm run e2e -- --grep terminals`** in the supported ROS environment; record any unavailable environment prerequisite instead of weakening the test.
- [x] **Step 3: Update README** to describe local shell access, inherited Cotton environment, and backend-restart behavior; the REST/WebSocket contract is maintained in Tasks 1 and 7.
- [x] **Step 4: Commit** as `docs: document terminal workspace behavior`.

### Task 16 (15 min): Run final checks and close the feature

**Files:**
- No new source files; verify the files created or modified by Tasks 1–15.

**Interfaces:**
- No implementation changes. This task verifies the acceptance criteria and repository quality gates.

- [x] **Step 1: Run the POSIX PTY integration test** with `pytest -m integration backend/tests/test_terminal_pty_exec.py -q`.
- [x] **Step 2: Run backend gates:** `ruff check backend`, `ruff format --check backend`, `mypy backend/src`, and `pytest -m "not integration" --cov=cotton --cov-fail-under=80`.
- [x] **Step 3: Run frontend gates:** `npm run lint`, `npm run typecheck`, `npm test -- --coverage`, and `npm run build`.
- [x] **Step 4: Confirm the diff contains terminal workspace changes and all acceptance criteria pass.**
- [x] **Step 5: Confirm task-level commits are present; Tasks 1–15 already committed the feature.**
