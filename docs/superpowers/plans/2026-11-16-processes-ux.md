# Processes panel UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the processes panel fit its dock, show what runs and what a profile stores, and replace the command box with a terminal-style prompt whose terminals can be reused, opened, closed and removed.

**Architecture:** The process manager gains a `close` use case (stop if active, forget the record, publish `process.removed`). The frontend renders one card per terminal, keeps its log console inside the card, and adds a prompt with command history and a terminal selector. A final pass translates the remaining UI to English.

**Tech Stack:** Python 3.10+, FastAPI, pytest, asyncio subprocesses; React 19, TypeScript, Zustand, Vitest + Testing Library, plain CSS.

**Spec:** `docs/superpowers/specs/2026-11-16-processes-ux-design.md`

**Branch:** work on `feat/processes-ux`, cut from the current `fix/audit-remediation` HEAD.

## Global Constraints

- No new backend or frontend dependency.
- Domain/application code stays framework-free: `ProcessManager` imports no FastAPI and no frontend type.
- All user-facing copy added by this plan is English; code, comments and commits are English.
- Backend Python 3.10+, `ruff` and `mypy` clean. Frontend ESLint and `tsc` clean.
- Coverage stays at or above 80 % on both sides.
- One Conventional Commit per task.
- Never launch a process with `shell=True`; argv lists only.
- Do not change the token, `Authorization` header or WebSocket `Origin` checks.
- Colour tokens are the existing `--ok` and `--off`; do not add themes.

## Review Focus

1. Closing a terminal must leave no orphan process group, and closing a terminal whose command already exited must still forget the record. Test in Task 1.
2. An id that becomes active between render and submit must return `409` and keep the typed command; the selector must not offer active terminals. Tests in Tasks 2 and 4.
3. Closing the console must not stop the process; closing the terminal must. Tests in Task 6.
4. Reusing a terminal in sequence must not show the previous command's output. Test in Task 4 (`clearLogs`).
5. A `process.removed` event must drop the card in every tab, not only in the one that called close. Tests in Tasks 3 and 6.

---

### Task 0: Commit the design and the plan

**Files:**
- Add: `docs/superpowers/specs/2026-11-16-processes-ux-design.md`
- Add: `docs/superpowers/plans/2026-11-16-processes-ux.md`

- [ ] **Step 1: Create the branch**

```bash
git switch -c feat/processes-ux
```

- [ ] **Step 2: Commit the documents**

```bash
git add docs/superpowers/specs/2026-11-16-processes-ux-design.md docs/superpowers/plans/2026-11-16-processes-ux.md
git commit -m "docs: specify the processes panel UX"
```

---

### Task 1: Close a terminal in the process manager

**Files:**
- Modify: `backend/src/ros_studio/processes/manager.py` (after `restart`, around line 145)
- Test: `backend/tests/test_process_manager.py`

**Interfaces:**
- Consumes: `ProcessManager.stop(process_id) -> ProcessRecord`, `_ACTIVE`, `_records`, `_buffers`, `_writers`, `_processes`, `_readers`, `_waiters`, `_registry`.
- Produces: `async def close(self, process_id: str) -> ProcessRecord`; publishes `("process.removed", {"id": process_id})`. Raises `ProcessNotFound` for an unknown id.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_process_manager.py` (import `Event` from `ros_studio.events`):

```python
async def test_close_stops_forgets_and_announces(manager: ProcessManager, bus: EventBus) -> None:
    queue = bus.subscribe()
    try:
        record = await manager.start(
            ProcessSpec(id="gone", argv=python_script("import time; time.sleep(30)"))
        )

        closed = await manager.close("gone")

        assert closed.state == "exited"
        assert not process_alive(record.pid)
        assert not group_alive(record.pgid)
        assert manager.list() == []
        with pytest.raises(ProcessNotFound):
            manager.logs("gone")

        await asyncio.sleep(0.05)
        events = []
        while not queue.empty():
            events.append(queue.get_nowait())
        assert Event("process.removed", {"id": "gone"}) in events
    finally:
        bus.unsubscribe(queue)


async def test_close_forgets_an_already_exited_process(manager: ProcessManager) -> None:
    await manager.start(ProcessSpec(id="done", argv=python_script("pass")))
    await eventually(lambda: manager.get("done").state == "exited")

    closed = await manager.close("done")

    assert closed.state == "exited"
    assert manager.list() == []


async def test_stop_keeps_the_record_and_does_not_announce_removal(
    manager: ProcessManager, bus: EventBus
) -> None:
    queue = bus.subscribe()
    try:
        await manager.start(ProcessSpec(id="kept", argv=python_script("import time; time.sleep(30)")))
        await manager.stop("kept")
        await asyncio.sleep(0.05)

        events = []
        while not queue.empty():
            events.append(queue.get_nowait())
        assert [record.id for record in manager.list()] == ["kept"]
        assert all(event.type != "process.removed" for event in events)
    finally:
        bus.unsubscribe(queue)
```

Extend `test_missing_process_raises` with:

```python
    with pytest.raises(ProcessNotFound):
        await manager.close("missing")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest backend/tests/test_process_manager.py -q`
Expected: FAIL with `AttributeError: 'ProcessManager' object has no attribute 'close'`.

- [ ] **Step 3: Implement `close` and `_forget`**

In `ProcessManager`:

```python
    async def close(self, process_id: str) -> ProcessRecord:
        record = self.get(process_id)
        if record.state in _ACTIVE:
            record = await self.stop(process_id)
        self._forget(process_id)
        await self._bus.publish("process.removed", {"id": process_id})
        return record

    def _forget(self, process_id: str) -> None:
        for collection in (
            self._records,
            self._buffers,
            self._writers,
            self._processes,
            self._readers,
            self._waiters,
        ):
            collection.pop(process_id, None)
        if self._registry is not None:
            self._registry.delete(process_id)
```

`stop` already waits for the waiter, so the tasks are finished before `_forget` drops the references.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest backend/tests/test_process_manager.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio/processes/manager.py backend/tests/test_process_manager.py
git commit -m "feat: close and forget a process terminal"
```

---

### Task 2: Expose closing a terminal over HTTP and WebSocket

**Files:**
- Modify: `backend/src/ros_studio/api/routes_processes.py`
- Modify: `docs/contracts/api.md` (endpoint table around line 215, event table around line 270, channel table around line 282)
- Test: `backend/tests/test_api_processes.py`

**Interfaces:**
- Consumes: `ProcessManager.close` from Task 1.
- Produces: `POST /api/processes/{process_id}/close` → 200 `ProcessRecord`; 404 `process_not_found`. The `processes` channel forwards `process.removed`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_api_processes.py`:

```python
def test_close_removes_the_terminal(
    services: Services, manager: ProcessManager, auth_headers: dict[str, str]
) -> None:
    with client_for(services) as client:
        client.post(
            "/api/processes", json={"id": "bye", "command": sleeper()}, headers=auth_headers
        )
        closed = client.post("/api/processes/bye/close", headers=auth_headers)
        listed = client.get("/api/processes", headers=auth_headers)
        again = client.post("/api/processes/bye/close", headers=auth_headers)

    assert closed.status_code == 200
    assert closed.json()["state"] == "exited"
    assert listed.json() == []
    assert again.status_code == 404
    assert again.json()["code"] == "process_not_found"


def test_websocket_forwards_process_removal(
    services: Services, manager: ProcessManager, auth_headers: dict[str, str]
) -> None:
    with client_for(services) as client:
        client.portal.call(manager.start, ProcessSpec(id="removable", argv=sleeper()))
        with client.websocket_connect(
            f"/ws?token={TOKEN}", headers={"origin": ORIGIN}
        ) as websocket:
            websocket.send_json({"type": "subscribe", "channels": ["processes"]})
            initial = websocket.receive_json()
            client.portal.call(manager.close, "removable")
            messages = [websocket.receive_json() for _ in range(3)]

    assert initial["type"] == "process.state"
    assert initial["data"]["id"] == "removable"
    assert messages[-1] == {"type": "process.removed", "data": {"id": "removable"}}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest backend/tests/test_api_processes.py -q`
Expected: FAIL, `POST /api/processes/bye/close` returns 405.

- [ ] **Step 3: Implement the route and the channel matcher**

In `create_router`, next to `restart_process`:

```python
    @router.post("/processes/{process_id}/close")
    async def close_process(process_id: str) -> dict[str, Any]:
        try:
            record = await manager.close(process_id)
        except ProcessNotFound as exc:
            raise ApiError(404, "process_not_found", str(exc)) from exc
        return record.to_dict()
```

In `register_process_channels`, replace the matcher with:

```python
            matches=lambda event: event.type in {"process.state", "process.removed"},
```

Document in `docs/contracts/api.md`:

- endpoint row: `| POST | /api/processes/{id}/close | 200 | Stopped `ProcessRecord`, forgotten from the registry; 404 `process_not_found` |`
- event row: `| process.removed | processes | {"id": string} |`
- channel initial row stays `One process.state per known process`; add that the channel also forwards `process.removed`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest backend/tests/test_api_processes.py backend/tests/test_process_manager.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio/api/routes_processes.py backend/tests/test_api_processes.py docs/contracts/api.md
git commit -m "feat: expose closing a process terminal"
```

---

### Task 3: Remove processes and clear logs in the store

**Files:**
- Modify: `frontend/src/api/types.ts` (the `ServerEvent` union, around line 114)
- Modify: `frontend/src/state/store.ts`
- Test: `frontend/src/state/store.test.ts`

**Interfaces:**
- Produces: `clearLogs(processId: string): void`, `removeProcess(processId: string): void`, and the event `{ type: "process.removed"; data: { id: string } }`.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/state/store.test.ts`:

```ts
it("clears the logs of one terminal only", () => {
  useStore.setState({ logs: { p1: [logLine("old")], p2: [logLine("keep")] } });

  useStore.getState().clearLogs("p1");

  expect(useStore.getState().logs).toEqual({ p2: [logLine("keep")] });
});

it("removes a process together with its logs", () => {
  useStore.setState({
    processes: { p1: processRecord("p1"), p2: processRecord("p2") },
    logs: { p1: [logLine("old")] },
  });

  useStore.getState().removeProcess("p1");

  expect(Object.keys(useStore.getState().processes)).toEqual(["p2"]);
  expect(useStore.getState().logs).toEqual({});
});

it("applies a process removal from the server", () => {
  useStore.setState({ processes: { p1: processRecord("p1") }, logs: { p1: [logLine("old")] } });

  useStore.getState().applyServerEvent({ type: "process.removed", data: { id: "p1" } });

  expect(useStore.getState().processes).toEqual({});
  expect(useStore.getState().logs).toEqual({});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/state/store.test.ts`
Expected: FAIL, `clearLogs is not a function`.

- [ ] **Step 3: Implement the store changes**

Add to `StoreState` and the store:

```ts
  clearLogs: (processId: string) => void;
  removeProcess: (processId: string) => void;

  clearLogs: (processId) => set((state) => ({ logs: without(state.logs, processId) })),
  removeProcess: (processId) =>
    set((state) => ({
      processes: without(state.processes, processId),
      logs: without(state.logs, processId),
    })),
```

with a module-level helper:

```ts
function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}
```

Add the event case in `applyServerEvent`:

```ts
      case "process.removed":
        set((state) => ({
          processes: without(state.processes, event.data.id),
          logs: without(state.logs, event.data.id),
        }));
        break;
```

Add to `ServerEvent` in `types.ts`:

```ts
  | { type: "process.removed"; data: { id: string } }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/state/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/state/store.ts frontend/src/state/store.test.ts
git commit -m "feat: remove closed processes from the frontend store"
```

---

### Task 4: Drive processes from a terminal prompt

**Files:**
- Modify: `frontend/src/features/processes/ProcessesView.tsx`
- Modify: `frontend/src/styles.css` (prompt styles)
- Test: `frontend/src/features/processes/ProcessesView.test.tsx`

**Interfaces:**
- Consumes: `clearLogs` from Task 3; `POST /api/processes` with an optional `id` (existing backend).
- Produces: the form contract later tasks use — accessible names `Command`, `Terminal`, `Run`, `Working directory`; `id` is sent only when a finished terminal is selected.

- [ ] **Step 1: Rewrite the form tests**

Replace the `starts a process from the form` test and add:

```tsx
it("starts a process from the prompt", async () => {
  apiSend.mockResolvedValue(record("p2"));

  renderView();
  fireEvent.change(screen.getByLabelText("Command"), { target: { value: "sleep 5" } });
  fireEvent.click(screen.getByRole("button", { name: "Run" }));

  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith("POST", "/api/processes", { command: "sleep 5" }),
  );
  expect(useStore.getState().processes.p2).toBeDefined();
  expect(screen.getByLabelText("Command")).toHaveValue("");
});

it("runs in the selected terminal and clears its logs", async () => {
  useStore.setState({
    processes: { p1: record("p1", { state: "exited", exit_code: 0 }) },
    logs: {
      p1: [{ id: "p1", stream: "stdout", level: null, ts: "2026-11-16T10:00:00Z", text: "old" }],
    },
  });
  apiSend.mockResolvedValue(record("p1"));

  renderView();
  fireEvent.change(screen.getByLabelText("Terminal"), { target: { value: "p1" } });
  fireEvent.change(screen.getByLabelText("Command"), { target: { value: "sleep 5" } });
  fireEvent.click(screen.getByRole("button", { name: "Run" }));

  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith("POST", "/api/processes", {
      command: "sleep 5",
      id: "p1",
    }),
  );
  expect(useStore.getState().logs.p1).toBeUndefined();
  expect(screen.getByLabelText("Terminal")).toHaveValue("");
});

it("keeps the command when the start fails", async () => {
  useStore.setState({ processes: { p1: record("p1", { state: "exited" }) } });
  apiSend.mockRejectedValue(new Error("process p1 is already active"));

  renderView();
  fireEvent.change(screen.getByLabelText("Terminal"), { target: { value: "p1" } });
  fireEvent.change(screen.getByLabelText("Command"), { target: { value: "sleep 5" } });
  fireEvent.click(screen.getByRole("button", { name: "Run" }));

  expect(await screen.findByText("process p1 is already active")).toBeInTheDocument();
  expect(screen.getByLabelText("Command")).toHaveValue("sleep 5");
});

it("offers only finished terminals to reuse", () => {
  useStore.setState({
    processes: { busy: record("busy"), done: record("done", { state: "exited" }) },
  });

  renderView();

  expect(screen.getByRole("option", { name: /done/ })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /busy/ })).not.toBeInTheDocument();
});

it("recalls launched commands with the arrow keys", async () => {
  apiSend.mockResolvedValue(record("p2"));
  renderView();
  const input = screen.getByLabelText("Command");

  for (const value of ["sleep 1", "sleep 2"]) {
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(apiSend).toHaveBeenCalled());
    apiSend.mockClear();
  }

  fireEvent.keyDown(input, { key: "ArrowUp" });
  expect(input).toHaveValue("sleep 2");
  fireEvent.keyDown(input, { key: "ArrowUp" });
  expect(input).toHaveValue("sleep 1");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input).toHaveValue("sleep 2");
});

it("sends the working directory only when it is set", async () => {
  apiSend.mockResolvedValue(record("p3"));

  renderView();
  fireEvent.change(screen.getByLabelText("Command"), { target: { value: "sleep 5" } });
  fireEvent.change(screen.getByLabelText("Working directory"), { target: { value: "/ws" } });
  fireEvent.click(screen.getByRole("button", { name: "Run" }));

  await waitFor(() =>
    expect(apiSend).toHaveBeenCalledWith("POST", "/api/processes", {
      command: "sleep 5",
      cwd: "/ws",
    }),
  );
});

it("ignores an empty command", () => {
  renderView();
  fireEvent.change(screen.getByLabelText("Command"), { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "Run" }));

  expect(apiSend).not.toHaveBeenCalled();
});
```

Also change the heading assertion in the empty-state test to `Processes` and `No processes`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/processes/ProcessesView.test.tsx`
Expected: FAIL, no element labelled `Command`.

- [ ] **Step 3: Implement the prompt**

State: `command`, `cwd`, `terminal` (`""` means new), `history: string[]`, `historyIndex: number | null`, `error`.

Selector options: `records.filter((record) => INACTIVE.has(record.state))`, where `INACTIVE = new Set(["exited", "failed"])`. Label each option `${record.id} · ${record.spec.argv.join(" ")}`; first option value `""` reads `New terminal`.

Submit: trim; return early when empty; capture `const target = terminal || null`; when a target exists call `useStore.getState().clearLogs(target)` **before** the request, so new output is never wiped by a late response; send `{ command: trimmed, ...(cwd.trim() ? { cwd: cwd.trim() } : {}), ...(target ? { id: target } : {}) }`; only on success clear `command`, reset `terminal` to `""`, append `trimmed` to `history`, and reset `historyIndex` to `null`. Make the existing `run` helper return `true` on success and `false` after setting the error, and return from `start` when it is `false`, so a rejected request keeps the typed command.

`ArrowUp` walks `history` from the end (`historyIndex === null` starts at `history.length - 1`, never below `0`). `ArrowDown` moves forward; past the end it clears the input and resets the index. Typing sets `historyIndex` to `null`.

Markup:

```tsx
<form className="process-form terminal-prompt" onSubmit={start}>
  <label className="terminal-line">
    <span className="terminal-marker" aria-hidden="true">$</span>
    <input
      className="terminal-input"
      type="text"
      aria-label="Command"
      placeholder="ros2 run demo_nodes_cpp talker"
      autoComplete="off"
      spellCheck={false}
      value={command}
      onChange={...}
      onKeyDown={recall}
    />
  </label>
  <label className="terminal-target">
    Terminal
    <select aria-label="Terminal" value={terminal} onChange={...}>
      <option value="">New terminal</option>
      {finished.map((record) => (
        <option key={record.id} value={record.id}>
          {`${record.id} · ${record.spec.argv.join(" ")}`}
        </option>
      ))}
    </select>
  </label>
  <button type="submit">Run</button>
  <details className="process-advanced">
    <summary>Advanced options</summary>
    <label>
      Working directory
      <input type="text" value={cwd} onChange={...} placeholder="~/ros2_ws" />
    </label>
    <p className="process-hint">
      Where the command runs. Empty uses the directory that started ROS Studio.
    </p>
  </details>
</form>
```

Keep the section `aria-label="Processes"` and the `h2` `Processes`.

CSS for the prompt: `.terminal-line` becomes a flex row with `flex: 1 1 18rem; min-width: 0`, a border, `border-radius: .25rem`, `background: var(--bg)` and `font-family: ui-monospace, SFMono-Regular, monospace`; `.terminal-input` takes `flex: 1; min-width: 0; border: 0; background: transparent; color: inherit; font: inherit`; `.terminal-marker` uses `color: var(--ok)`; `.process-advanced` spans the row with `flex-basis: 100%`; `.process-hint` uses `color: var(--muted); font-size: .8125rem; margin: 0`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/processes/ProcessesView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/processes/ProcessesView.tsx frontend/src/styles.css frontend/src/features/processes/ProcessesView.test.tsx
git commit -m "feat: drive processes from a terminal prompt"
```

---

### Task 5: Process cards that fit the panel

**Files:**
- Modify: `frontend/src/features/processes/ProcessesView.tsx`
- Modify: `frontend/src/styles.css` (the `.process-*` block, lines 349-454)
- Test: `frontend/src/features/processes/ProcessesView.test.tsx`

**Interfaces:**
- Produces: every card is `<li className="process-card" data-state={record.state}>`; labels `Starting`, `Running`, `Stopping`, `Exited`, `Failed`.

- [ ] **Step 1: Write the failing tests**

Replace `shows the state and exit code of a failed process` and add:

```tsx
it("labels a failed process and marks its card", async () => {
  useStore.setState({ processes: { p1: record("p1", { state: "failed", exit_code: 3 }) } });

  renderView();

  expect(await screen.findByText("Failed")).toBeInTheDocument();
  expect(screen.getByText("exit 3")).toBeInTheDocument();
  expect(screen.getByText("p1").closest("li")).toHaveAttribute("data-state", "failed");
});

it("labels a running process and marks its card", async () => {
  useStore.setState({ processes: { p1: record("p1") } });

  renderView();

  expect(await screen.findByText("Running")).toBeInTheDocument();
  expect(screen.getByText("p1").closest("li")).toHaveAttribute("data-state", "running");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/processes/ProcessesView.test.tsx`
Expected: FAIL, text `Failed` not found (the card still prints `failed`).

- [ ] **Step 3: Implement the card markup**

Add `STATE_LABELS: Record<ProcessState, string>` with `starting: "Starting"`, `running: "Running"`, `stopping: "Stopping"`, `exited: "Exited"`, `failed: "Failed"`.

Card structure:

```tsx
<li key={record.id} className="process-card" data-state={record.state}>
  <div className="process-info">
    <div className="process-heading">
      <strong>{record.id}</strong>
      <span className="process-state" data-state={record.state}>
        {STATE_LABELS[record.state]}
      </span>
      {record.exit_code !== null && <span className="process-exit">exit {record.exit_code}</span>}
    </div>
    <code className="process-argv">{record.spec.argv.join(" ")}</code>
    {record.spec.cwd && <p className="process-cwd">cwd {record.spec.cwd}</p>}
    {record.error && <p className="process-error">{record.error}</p>}
  </div>
  <div className="process-actions">…existing actions…</div>
</li>
```

Keep the existing logs panel below the list for now; Task 6 moves it into the card.

CSS: replace the `.process-list > li` rule with a wrapping flex card; add `min-width: 0` to `.processes-view`; add `.process-info` (`flex: 1 1 16rem; min-width: 0; display: grid; gap: .25rem`), `.process-heading` (wrapping flex row), `.process-argv` (`display: block; overflow-wrap: anywhere`), `.process-actions` (`flex-wrap: wrap; margin-left: auto`), and state colours:

```css
.process-list > li[data-state="running"] {
  border-color: var(--ok);
  box-shadow: inset 3px 0 0 var(--ok);
}

.process-list > li[data-state="failed"] {
  border-color: var(--off);
  box-shadow: inset 3px 0 0 var(--off);
}

.process-state[data-state="running"] {
  color: var(--ok);
}

.process-state[data-state="failed"] {
  color: var(--off);
}
```

No viewport media queries: the card wraps at the panel's own width.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/processes/ProcessesView.test.tsx && npm run lint && npm run typecheck`
Expected: PASS and both checks clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/processes/ProcessesView.tsx frontend/src/styles.css frontend/src/features/processes/ProcessesView.test.tsx
git commit -m "feat: make the process list fit its panel"
```

---

### Task 6: Open, close and remove terminals

**Files:**
- Modify: `frontend/src/features/processes/ProcessesView.tsx`
- Modify: `frontend/src/features/processes/LogsPanel.tsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/features/processes/ProcessesView.test.tsx`
- Test: `frontend/src/features/processes/LogsPanel.test.tsx`

**Interfaces:**
- Consumes: `removeProcess` and the `process.removed` event from Task 3; `POST /api/processes/{id}/close` from Task 2.
- Produces: `LogsPanel({ processId, onClose }: { processId: string; onClose?: () => void })`; card actions `Terminal` (toggle), `Restart`, `Stop`, `Close terminal`.

- [ ] **Step 1: Write the failing tests**

In `LogsPanel.test.tsx`, add:

```tsx
it("closes the console without touching the process", () => {
  const onClose = vi.fn();

  render(<LogsPanel processId="p1" onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Close logs" }));

  expect(onClose).toHaveBeenCalledOnce();
});
```

Update its other assertions to the English labels (`Level`, `Search logs`, `Download`).

In `ProcessesView.test.tsx`, add:

```tsx
it("opens and closes the console of a process", async () => {
  useStore.setState({ processes: { p1: record("p1") } });
  renderView();

  fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
  expect(screen.getByRole("region", { name: "Logs for p1" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Close logs" }));
  expect(screen.queryByRole("region", { name: "Logs for p1" })).not.toBeInTheDocument();
  expect(apiSend).not.toHaveBeenCalled();
});

it("closes a running terminal after confirmation", async () => {
  useStore.setState({
    processes: { p1: record("p1") },
    logs: { p1: [{ id: "p1", stream: "stdout", level: null, ts: "now", text: "old" }] },
  });
  apiSend.mockResolvedValue(record("p1", { state: "exited", exit_code: 0 }));
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

  renderView();
  fireEvent.click(screen.getByRole("button", { name: "Close terminal" }));

  await waitFor(() => expect(apiSend).toHaveBeenCalledWith("POST", "/api/processes/p1/close"));
  expect(confirm).toHaveBeenCalled();
  expect(useStore.getState().processes.p1).toBeUndefined();
  expect(useStore.getState().logs.p1).toBeUndefined();
});

it("does not close a running terminal when the user cancels", () => {
  useStore.setState({ processes: { p1: record("p1") } });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

  renderView();
  fireEvent.click(screen.getByRole("button", { name: "Close terminal" }));

  expect(confirm).toHaveBeenCalled();
  expect(apiSend).not.toHaveBeenCalled();
  expect(useStore.getState().processes.p1).toBeDefined();
});

it("closes a finished terminal without confirmation", async () => {
  useStore.setState({ processes: { p1: record("p1", { state: "exited", exit_code: 0 }) } });
  apiSend.mockResolvedValue(record("p1", { state: "exited", exit_code: 0 }));
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

  renderView();
  fireEvent.click(screen.getByRole("button", { name: "Close terminal" }));

  await waitFor(() => expect(apiSend).toHaveBeenCalledWith("POST", "/api/processes/p1/close"));
  expect(confirm).not.toHaveBeenCalled();
});

it("drops the card when the server removes the process", () => {
  useStore.setState({ processes: { p1: record("p1") } });
  renderView();

  act(() => {
    useStore.getState().applyServerEvent({ type: "process.removed", data: { id: "p1" } });
  });

  expect(screen.queryByText("p1")).not.toBeInTheDocument();
});
```

Import `act` from `@testing-library/react`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/processes`
Expected: FAIL, no `Terminal` button and no `Close logs` button.

- [ ] **Step 3: Implement the console lifecycle**

In `ProcessesView`:

- Replace `selected` with `openConsoles: string[]` and a `toggleConsole(id)` that adds or removes the id.
- Move the console into the card, full width: `{openConsoles.includes(record.id) && <LogsPanel processId={record.id} onClose={() => toggleConsole(record.id)} />}`. Remove the panel rendered below the list.
- Add the actions in order: `Terminal` (`aria-pressed` reflects the open console), `Restart`, `Stop`, `Close terminal`.
- `closeTerminal(record)`: when the state is active, `window.confirm(\`Closing this terminal stops ${record.id}. Continue?\`)` and return when cancelled; `apiSend("POST", \`/api/processes/${encodeURIComponent(record.id)}/close\`)`; on success `useStore.getState().removeProcess(record.id)` and drop the id from `openConsoles`; on failure set the error message. Do not route it through `run`, which would upsert the returned record.

In `LogsPanel`:

- Props `{ processId, onClose }`; heading `<h2>Logs · {processId}</h2>`; when `onClose` is provided, a `Close` button with `aria-label="Close logs"` inside a `.logs-header`.
- `LEVELS` becomes `["all", "debug", "info", "warn", "error"]`; the first option reads `All`; aria-label `Level`; placeholder `Search logs`; button `Download`; empty state `No logs`; region `Logs for {processId}`.

CSS: `.logs-panel` inside a card gets `flex-basis: 100%`; `.logs-header` is a flex row with `justify-content: space-between; align-items: center; gap: .5rem`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/processes && npm run lint && npm run typecheck`
Expected: PASS and both checks clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/processes frontend/src/styles.css
git commit -m "feat: open, close and remove process terminals"
```

---

### Task 7: Show what a profile stores

**Files:**
- Modify: `frontend/src/features/processes/ProfilesPanel.tsx`
- Modify: `frontend/src/styles.css` (the `.profile-list` rules)
- Test: `frontend/src/features/processes/ProfilesPanel.test.tsx`

**Interfaces:**
- Produces: each profile renders its `spec.argv.join(" ")` as `<code>` and `cwd {spec.cwd}` when set; labels `Profiles`, `Profile name`, `Save as profile`, `Start`, `No profiles`, `No processes in this profile`.

- [ ] **Step 1: Write the failing test**

```tsx
it("shows the command and working directory stored in a profile", async () => {
  apiGet.mockResolvedValue([
    {
      id: "sim",
      name: "Sim",
      processes: [
        {
          id: "a",
          argv: ["ros2", "launch", "demo", "demo.launch.py"],
          cwd: "/ws",
          env: {},
          plugin: null,
          autostart: false,
        },
      ],
    },
  ]);

  render(<ProfilesPanel processes={[]} />);

  expect(await screen.findByText("ros2 launch demo demo.launch.py")).toBeInTheDocument();
  expect(screen.getByText("cwd /ws")).toBeInTheDocument();
});
```

Add a second profile with `processes: []` and assert `No processes in this profile`. Update the existing tests to `Profile name`, `Save as profile`, `Start`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/features/processes/ProfilesPanel.test.tsx`
Expected: FAIL, the command is not rendered.

- [ ] **Step 3: Implement the profile block**

Default name `Profile`; heading `Profiles`; empty list `No profiles`. Each `<li>` contains a `.profile-heading` row with the name and the `Start` button, followed by a `<ul className="profile-commands">` with one `<li>` per spec: `<code>{spec.argv.join(" ")}</code>` and, when `spec.cwd`, `<span className="profile-cwd">cwd {spec.cwd}</span>`. When `profile.processes.length === 0`, render `No processes in this profile`.

CSS: make `.profile-list li` a block with a `gap`; `.profile-heading` a wrapping flex row with `justify-content: space-between`; `.profile-commands` a borderless list with `font-family: ui-monospace, SFMono-Regular, monospace; font-size: .8125rem; color: var(--muted)` and `overflow-wrap: anywhere`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/processes/ProfilesPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/processes/ProfilesPanel.tsx frontend/src/features/processes/ProfilesPanel.test.tsx frontend/src/styles.css
git commit -m "feat: show stored commands in profiles"
```

---

### Task 8: Translate the rest of the UI to English

**Files:**
- Modify: `frontend/src/features/graph/GraphPanel.tsx`, `GraphView.tsx`, `NodeParams.tsx`, `TopicDetail.tsx`, `register.ts`
- Modify: `frontend/src/features/plugins/PluginsView.tsx`, `PluginPanel.tsx`
- Modify: `frontend/src/layout/CommandPalette.tsx`, `StatusBar.tsx`, `Workbench.tsx`, `shellPanels.ts`
- Modify the matching tests: `GraphPanel.test.tsx`, `GraphView.test.tsx`, `NodeParams.test.tsx`, `TopicDetail.test.tsx`, `PluginsView.test.tsx`, `PluginPanel.test.tsx`, `CommandPalette.test.tsx`, `StatusBar.test.tsx`, `Workbench.test.tsx`, `PlaceholderPanel.test.tsx`

**Interfaces:**
- No behaviour change; only copy and the assertions that pin it.

- [ ] **Step 1: Translate the graph feature and its tests**

| File | New copy |
|---|---|
| `GraphPanel.tsx` | `Waiting for the graph…` |
| `GraphView.tsx` | `aria-label="ROS graph"`, `aria-label="Search the graph"`, placeholder `Search`, `Nodes`, `No nodes`, `No topics`, `Services`, `No services`, `Actions`, `No actions` |
| `NodeParams.tsx` | `aria-label={\`Parameters of ${nodeName}\`}`, `Parameters of {nodeName}`, `Loading parameters…`, `No parameters`, `Not editable`, `Invalid value`, `Could not save`, `aria-label={\`Save ${name}\`}`, `Save` |
| `TopicDetail.tsx` | `Type: `, `unknown`, `Publishers`, `No publishers`, `Subscribers`, `No subscribers`, `Measuring…`, `Measure rate`, `Unavailable: no publishers`, `Unavailable: unknown type`, `Rate unavailable`, `Could not measure the rate` |
| `register.ts` | panel title `Graph` |

Run: `cd frontend && npx vitest run src/features/graph`
Expected: PASS.

- [ ] **Step 2: Translate plugins, layout and shell, and their tests**

| File | New copy |
|---|---|
| `PluginsView.tsx` | `Discovered`, `Active`, `Stopped`, `Error`; `Could not complete the action`; `No plugins`; `State: `; `Permissions: `; `none`; `Open panel`; `Deactivate`; `Activate` |
| `PluginPanel.tsx` | `aria-label="Close panel"`, `Close`, `This panel type cannot be embedded.`, `The viewer assets are not available. Check the connection and restart ROS Studio, or copy lichtblick-web.tar.gz into the local cache before starting.` |
| `CommandPalette.tsx` | `Open graph`, `Open processes`, `Open plugins`, `aria-label="Command palette"`, `aria-label="Search actions"`, placeholder `Search actions` |
| `StatusBar.tsx` | `Domain`, `Processes`, `ROS connected`, `ROS disconnected`, `Errors`, `aria-label="Theme"`, `Light theme`, `Dark theme` |
| `Workbench.tsx` | `aria-label="Sections"` |
| `shellPanels.ts` | `Graph`, `Processes` |

Run: `cd frontend && npx vitest run src/features/plugins src/layout`
Expected: PASS.

- [ ] **Step 3: Run the full frontend checks and search for leftover Spanish copy**

Run: `cd frontend && npm run lint && npm run typecheck && npm test -- --coverage`
Expected: lint and types clean; all suites pass; statements ≥ 80 %.

Run: `cd frontend && grep -rnE "[áéíóúñ¿¡]" src`
Expected: no output. `src/api/ws.ts` is already English; do not edit it.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/graph frontend/src/features/plugins frontend/src/layout
git commit -m "refactor: translate the frontend UI to English"
```

---

## Final verification

- [ ] Backend: `.venv/bin/ruff check backend && .venv/bin/ruff format --check backend && .venv/bin/mypy backend/src && .venv/bin/python -m pytest -m "not integration" --cov=ros_studio --cov-fail-under=80`
- [ ] Frontend: `cd frontend && npm run lint && npm run typecheck && npm test -- --coverage`
- [ ] Manual: open the app, start two commands in two terminals, confirm both cards show a green border, the consoles open and close independently, closing a running terminal asks for confirmation, and the profile list shows the stored commands at a narrow dock width.
- [ ] Update `docs/verification-ros.md` only if a check cannot run here; do not claim ROS, Docker or Playwright verification.
