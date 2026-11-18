# Processes panel UX — design

Date: 2026-11-16
Status: proposed
Scope: `frontend/src/features/processes/*`, `frontend/src/styles.css`,
`frontend/src/state/store.ts`, `frontend/src/api/types.ts`,
`backend/src/cotton/processes/manager.py`,
`backend/src/cotton/api/routes_processes.py`, plus a follow-up pass that
translates the whole UI to English.

## Intent

The processes panel is where a ROS 2 session is driven, but it is uncomfortable:
the action buttons of a process overflow horizontally, the running process is
not visually distinguishable, profiles do not show what they will start, the
`cwd` field is unexplained, and the command box does not feel like the terminal
it replaces. Terminals also cannot be closed: a process that has finished stays
in the list forever.

## Goals

- The panel adapts to the width of its dock panel, not of the viewport.
- A running process is obvious at a glance (green border and green badge).
- A saved profile shows every command it stores.
- `cwd` is explained and out of the way.
- The command entry reads and behaves like a terminal prompt: monospace,
  prompt marker, Enter to run, up/down history.
- A new command can open a new terminal (parallel process) or reuse a terminal
  that already finished.
- Terminals open and close like logs: consoles can be shown or hidden per
  process, and closing a terminal stops it and removes it for good.
- Every user-facing label in the app is in English.

## Non-goals

- Interactive stdin, PTY or `xterm.js`. Commands cannot be typed into a live
  process; that needs a backend module and a new dependency.
- Terminal tabs or a layout that hides parallel processes.
- Persisted command history, autocompletion or command suggestions.
- Translating backend error messages; they are already English.

## Approaches considered

1. **Console plus cards (chosen).** A terminal-style prompt bar and one card per
   process in a wrapping list, with its console inside the card. Reuses the
   existing per-process logs and needs only a small backend addition.
2. **Terminal tabs.** One active panel per process, like an editor. More code and
   it hides the state of the other parallel processes.
3. **Minimal CSS patch.** Fix the overflow and paint the state, keep the plain
   form. Cheapest, but leaves the command entry, the missing close and the
   `cwd` confusion in place.

## Decisions

### Terminal semantics

A terminal is a process slot. The process list is the set of terminals.

- The selector offers `New terminal` plus every slot whose state is `exited` or
  `failed`, labelled with its id and its last command.
- `New terminal` omits `id`, so the backend allocates `p_<hex>`.
- Reusing a slot sends that slot's `id`; the backend replaces the spec and
  starts the new command in the same slot. Logs for that id are cleared first so
  the terminal does not show the previous command's output.
- Active slots are not offered. If a race returns `409`, the error is shown.
- The selector resets to `New terminal` after a successful start.

### Closing a terminal

- `POST /api/processes/{id}/close` is a new adapter over
  `ProcessManager.close`: stop the process when it is active, then forget the
  record, its buffer, its writer and its tasks, and delete the registry row.
- The manager publishes `process.removed` with `{"id": ...}`. The `processes`
  WebSocket channel matches it.
- The frontend removes the record and its logs from the store on both the HTTP
  response and the event, so every open tab converges.
- Closing an active terminal asks for confirmation first; closing a finished one
  does not.
- The log file on disk is kept; only the in-memory record disappears.

### Consoles

- Each card has a `Terminal` toggle. Opening it renders the log panel inside that
  card, so several terminals can be open at once, one per process.
- The log panel gets a `Close` button that collapses it. Hiding a console does
  not touch the process.
- Closing the terminal removes the card and its console.
- `ws.subscribe` only ever adds channels, so open/close does not need an
  unsubscribe path; logs are capped by the existing buffer limit.

### Command entry

- One form with a monospace prompt marker (`$`), a labelled text input and a
  submit button.
- `Enter` submits. `ArrowUp`/`ArrowDown` walk the commands launched in this
  session, newest first. History lives in component state.
- The input keeps the accessible name `Command`; the button is `Run`.
- `cwd` moves into a collapsed `Advanced options` disclosure with the help
  text: the directory where the command runs; empty uses the directory that
  started Cotton.

### Process cards

- Each `<li>` is a card. Command and metadata are one flex item with
  `min-width: 0`; the actions are another that wraps. Both wrap inside the panel
  width, so no horizontal scroll and no viewport media queries.
- The command is rendered in a `<code>` that wraps anywhere.
- State labels carry `data-state` for styling: `starting` → Starting,
  `running` → Running, `stopping` → Stopping, `exited` → Exited,
  `failed` → Failed.
- A running card gets a green border and a green left inset bar; `failed` uses
  the off colour. Colours come from the existing `--ok` / `--off` tokens.
- Actions, in order: Terminal, Restart, Stop, Close.

### Profiles

- Each profile is a block: name and `Start` on the first row, then the stored
  commands as `<code>` lines, with the `cwd` when present.
- A profile with no processes says so.

### Store

- Add `clearLogs(processId)` and `removeProcess(processId)` and call `clearLogs`
  before starting or restarting, so a reused slot and a restart both begin with
  an empty terminal. The server already recreates its log buffer on start.
- `removeProcess` deletes the record and its logs; `process.removed` calls it.

### English pass

The processes panel ships already in English. A second, separate commit
translates every remaining user-facing string: graph panel and views, topic and
node details, parameters, plugins, command palette, placeholder panels, the
status bar, shell panel titles and the WebSocket error message, together with
the assertions in their tests. Behaviour does not change.

## Testing

Vitest + Testing Library and pytest, red before green:

- Backend: `close` on a running process stops it, forgets it, publishes
  `process.removed` and makes `GET /api/processes` omit it; `close` on an unknown
  id is `404`; closing twice is `404`; the channel forwards the event.
- Frontend: starting without a selected slot omits `id`; starting with one sends
  that `id` and clears its logs.
- History recalls the previous command with `ArrowUp`.
- A running card exposes `data-state="running"` and the label `Running`; a
  failed card shows `Failed` and its exit code.
- The terminal toggle opens and closes the log panel; closing a running terminal
  asks for confirmation and calls the close endpoint; a `process.removed` event
  drops the card.
- `cwd` is only sent when the advanced field is filled.
- A profile shows the stored command and its `cwd`.
- The English pass leaves every suite green; coverage stays above 80 %.

## Open risks

- Reusing an id that is still active returns `409`; the UI shows the error
  instead of retrying.
- The selector is only as fresh as the process map; a slot that finishes while
  the selector is open appears after the next state event.
- The English pass rewrites many assertions at once; a missed label is caught by
  the tests only where they assert the text.

## Left to the builder

- Exact spacing and breakpoints of the card layout.
- Whether the prompt marker shows the `cwd`; the proposal does not.
- Wording of the advanced help text beyond the meaning above.

## Addendum 2026-11-16 — command completion

The prompt now completes commands from the backend `PATH`, ROS 2 verbs and
subcommands, and node, topic, service and action names from the graph. `Tab`
and the arrow keys move through the suggestions; `Enter` accepts the selected
one. `Ctrl+R` opens a reverse search over the last 100 launched commands, which
are persisted in `localStorage`.

This supersedes the non-goals for persisted command history and autocompletion.
Interactive stdin, a PTY and `xterm.js` remain out of scope.
