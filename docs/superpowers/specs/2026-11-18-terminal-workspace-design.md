# Cotton Terminal Workspace — Design

**Status:** Approved
**Branch:** `feat/commands`
**Date:** 2026-11-18

## Intent

Add a terminal workspace to Cotton so ROS developers can open many interactive
or non-interactive command sessions in one place instead of managing separate
desktop terminal windows. The workspace remains part of Cotton's local web UI.

## Existing architecture

Cotton serves a React frontend from its local FastAPI backend. The frontend
already uses `dockview` for panels and stores layout in `localStorage`. The
backend's `ProcessManager` starts managed processes with pipes, captures their
logs, and reports process state over the authenticated WebSocket. Pipes do not
provide an interactive terminal or terminal resizing.

## Goals

- Open as many terminal sessions as system resources allow, each with a PTY.
- Open a shell by default; optionally start a command directly in a new
  terminal. Both interactive and non-interactive programs must work.
- Show session state and command exit information where available.
- Organize sessions into user-created groups.
- Allow each group to mix tabs and tiled terminal panels.
- Move a terminal between tabbed and tiled presentation by dragging it to the
  tab strip or an edge of another terminal.
- Resize tiled panes with dividers; neighboring panes adapt to the new size.
- Minimize a terminal without stopping its session. Closing it terminates the
  session and asks for confirmation if it has an active command.
- Keep PTY sessions alive while hidden or while the frontend reconnects, as long
  as the Cotton backend is running.

## Non-goals and anti-goals

- No integration with Herdr, Orca, or another external terminal multiplexer.
- No conversion of Cotton into a native desktop application.
- No recovery or reattachment of sessions after the Cotton backend crashes or
  restarts.
- No remote access, cloud service, telemetry, or arbitrary network bind.
- No replacement of `ProcessManager` for profile/plugin-managed processes.

## Approaches considered

1. **Restyle existing process logs.** Smallest change, but pipes cannot accept
   terminal input, provide a controlling TTY, or support interactive programs.
   Rejected because it misses the core requirement.
2. **Add Cotton-owned PTY sessions to the existing web UI.** Reuses the local
   React/FastAPI architecture and `dockview`, while adding a session lifecycle
   specifically for terminals. Chosen because it supports interactive shells
   without an external multiplexer dependency.
3. **Use an external session broker such as `tmux`.** Would make detached
   sessions and reattachment after a backend restart more practical, but adds a
   runtime dependency and platform-specific packaging. Rejected because crash
   recovery is out of scope.

## Chosen design

### Terminal workspace UI

Each terminal belongs to a group. A group's terminal area has a tab strip and
zero or more tiled panes. A terminal can be represented as a tab or placed in
the tiled layout; groups may mix both. Dragging a tab to the tab strip keeps it
tabbed, while dropping it on an edge of a visible pane creates a split. Split
dividers resize adjacent panes. The existing docking/layout approach should be
extended rather than replaced.

The group list shows session status. Minimizing moves a terminal out of the
visible area but leaves its PTY and process running. Closing is distinct:
Cotton terminates the session, with confirmation when a command is active.

Creating a terminal opens the user's default interactive shell, selected from
`$SHELL` with `/bin/sh` as fallback. It inherits Cotton's environment and
working directory; no login-shell mode is used by default. The user can also
start a specific executable in a new terminal; this command mode uses an
argument list, not shell interpolation. Commands typed into a shell are
handled by that shell.

Groups and panel placement follow Cotton's existing `localStorage` layout
behavior. Terminal sessions themselves are owned by the Cotton instance and
listed by the backend, so another authorized frontend tab can reconnect to
them. A stale local layout entry is discarded if its session no longer exists.

### Backend sessions and lifecycle

Add a terminal-session manager that owns PTY file descriptors and child process
lifecycles. It forwards terminal input/output, window-size changes, and exit
state between the frontend and PTY over authenticated WebSocket channels. The
manager must not treat PTY output as ordinary line-oriented process logs.

Terminal sessions are separate from `ProcessManager`: profiles and plugins keep
their existing managed-process behavior. Terminal sessions live in backend
memory while Cotton is running; a frontend disconnect does not stop them, but a
backend restart ends them and does not permit reattachment. A normal Cotton
shutdown must terminate its terminal sessions.

The backend retains a bounded in-memory output buffer per session so a frontend
can reconnect without losing recent output. The scrollback limit is an
implementation choice. All clients with Cotton's valid local session token
share the same terminal sessions; the app remains single-user, not a
multi-user collaboration system.

Session state should distinguish startup, live, exited, and failed sessions.
Directly launched commands can report their exit code. For shell sessions,
"live" means the shell/PTY is alive; detecting whether an arbitrary shell is at
its prompt or running a foreground job is not required. Closing a direct
command session prompts while that command is running. For a shell, prompt
before closing when the PTY reports a foreground process group other than the
shell's; if that cannot be determined reliably, prompt for every live shell.

### Security and platform

PTY access is equivalent to local shell access. All terminal APIs and WebSocket
channels use Cotton's existing session-token and WebSocket `Origin` checks.
Cotton remains bound to loopback by default. Validate command arguments,
environment and working directory at the API boundary, and do not log terminal
input or secrets.

The implementation must respect the project's supported local environments
(Linux, WSL2 and Docker; macOS is used for development). It must not add
recovery infrastructure or require a separately installed multiplexer.

## Acceptance criteria

- A user can create multiple shell and command sessions; interactive input,
  output, and terminal resizing work.
- Sessions remain alive when minimized and can be reattached by the frontend
  while the backend remains up.
- Groups support tabs and resizable tiled panes at the same time; drag/drop
  moves sessions between those presentations.
- Session state is visible and updates when a command or shell exits.
- Closing an active session confirms before terminating it; Cotton shutdown
  stops sessions.
- Existing profile/plugin process management and its logs remain unchanged.
- Unauthorized REST/WebSocket access cannot read or control terminal sessions.

## Decisions left to the builder

- Select or reuse a terminal-emulator component compatible with the current
  frontend dependencies.
- Choose the minimal PTY adapter and WebSocket message shapes consistent with
  current API contracts and architecture.
- Define a sensible scrollback limit and explicit errors when OS resources are
  exhausted; do not impose an arbitrary session-count cap.
- Decide the visual details for group creation, renaming, and minimized-session
  access, keeping the approved groups/tabs/mosaic interaction.
