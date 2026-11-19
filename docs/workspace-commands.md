# Workspace commands — requirements note

A workspace can carry a list of commands the user saves once and reuses. As in
Orca, the same stored command can be launched on demand as a quick command, and
can optionally run automatically when a terminal opens.

> The terminal panel currently exposes only plain shells. The command API below
> is implemented and kept for the next UI pass, but the panel does not list,
> create or run stored commands.

## Rules

- **The user registers them.** No discovery of `launch` files, packages or
  `setup.bash` paths, and nothing captured from previous terminals. The user
  writes each command and saves it on the workspace.
- **They are shell text.** `source`, `&&`, pipes and redirections must work, so
  they run inside a shell and are never split with `shlex`.
- **Scope.** A command belongs to a workspace and appears only in that workspace.
  Global commands (as Orca has them) are out of scope for now; a command that is
  useful everywhere is repeated in the workspaces that need it.
- A terminal started with its own one-off command is unaffected; that behavior
  stays as it is today.

## Quick commands

Stored commands are listed for the workspace and can be run from the
workspace's tab bar or menu:

- **run**: opens a new terminal tab and runs the command there, chained after the
  startup command so a failed `source` stops it;
- **insert**: puts the command text in the active terminal without running it.

Those are the two Orca actions, and they are what makes the stored list useful
beyond opening a terminal.

## Startup command

Any stored command can be flagged to run automatically in every interactive
shell opened in that workspace, which is how a user automates
`source install/setup.bash`. Because it runs without a click, the workspace shows
which command is flagged and the terminal shows the command it ran.

Rules:

- **One per workspace.** Marking another command as startup moves the flag.
- **One line.** It is a preparation command (`source`, `export`), not a script;
  keeping it single-line is what lets Cotton chain it with the body of a quick
  command and stop when it fails instead of running the body anyway.
- **Runs once per new shell**, written by the server into that shell, never in a
  terminal started with a one-off argv command.
- **Idempotent.** It runs in every terminal of the workspace and, later, in the
  ROS graph sidecar, so it must only prepare the environment: no long-running
  processes and no side effects.

## No captured environment

Registering a workspace does not capture or store an environment. The startup
command is the mechanism that sources `install/setup.bash`; nothing is
snapshotted to disk. A terminal started with a one-off argv `command` keeps
inheriting Cotton's environment, which is why the startup command is the
supported path for workspace-specific setups.

## Relation to the ROS graph

The graph is keyed by ROS environment (distro, domain, RMW, discovery range), and
that environment is derived by launching a sidecar with the workspace startup
command. So this startup command is also the input of the graph: there is one
source of truth, and no separate environment fields are added to the workspace.
See `docs/ros-graph-environments.md`.
