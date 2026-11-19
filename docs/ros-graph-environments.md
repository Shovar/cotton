# ROS graph environments — design note

How Cotton should show ROS graphs when terminals belong to different workspaces,
and why the graph is keyed by ROS environment instead of by workspace.

Status: phase 1 is implemented — the graph panel names the ROS environment it
shows. Phases 2 and 3 (sidecar per environment and environment tabs) are not
implemented, so the graph still describes Cotton's own process (see
`docs/known-limitations.md`).

## 1. The key is the ROS environment, not the workspace

What decides which graph you see is the tuple:

```
(ROS_DISTRO, ROS_DOMAIN_ID, RMW_IMPLEMENTATION, ROS_LOCALHOST_ONLY | ROS_AUTOMATIC_DISCOVERY_RANGE)
```

Two workspaces with the same distro and domain see exactly the same graph.
Showing them as separate tabs would be redundant and would spend one more DDS
participant for nothing. So:

- a **workspace points at an environment**;
- several workspaces can share one graph tab;
- the graph UI shows one tab per **environment**, never per workspace.

## 2. One process per environment, not one thread

A `rclpy` node per thread works while every workspace uses the same distro, and
breaks as soon as they differ: `rclpy` and the message types are C extensions
linked against the sourced distro, so Humble and Jazzy cannot be loaded in the
same interpreter. Same distro with different domains can be done with separate
contexts (`rclpy.init(context=ctx, domain_id=N)`), but that closes the door to
everything else.

The robust architecture is a **sidecar per environment**:

- it runs as a subprocess with the environment already sourced;
- it talks to Cotton over a dedicated channel (Unix socket, or an extra file
  descriptor) carrying JSON events: node added or removed, topics, parameters
  changed, rates;
- if a sidecar dies, only that tab goes down: Cotton marks it disconnected and
  can relaunch it.

This gives a clean boundary as well: core Cotton stops depending on `rclpy`, and
the sidecar can be reused by other frontends.

## 3. The environment is derived, not declared

The startup command of the workspace (see `docs/workspace-commands.md`) is the
single source of truth:

- the sidecar is launched as `$SHELL -i -c '<startup>; exec python3 -m <sidecar>'`,
  so it inherits exactly what the terminal sees;
- on connect, the sidecar **reports its own environment** (`ROS_DISTRO`,
  `ROS_DOMAIN_ID`, defaulting to 0, `RMW_IMPLEMENTATION`,
  `ROS_LOCALHOST_ONLY` / `ROS_AUTOMATIC_DISCOVERY_RANGE`);
- Cotton groups workspaces with the same tuple into one tab, and the panel header
  is filled from those reported values.

There are deliberately **no declared environment fields** on the workspace
(`ros_domain_id`, `distro`). The real environment of a ROS 2 developer comes from
the shell: sourcing the underlay and the overlay and exporting the DDS
variables, often through aliases or functions. Declared fields drift out of sync
with what the startup command actually does. A declared override can be added
later on top of this if it is ever needed; today it is not.

A workspace **without** a startup command uses Cotton's own environment, and the
panel header says so.

Things to watch when implementing:

- **Aliases and functions** only exist in interactive shells, hence `-i`. That
  can print rc noise (banners, conda), so the sidecar must speak over its own
  channel, not stdout.
- **Respect `$SHELL`** instead of forcing bash: a zsh user sources `setup.zsh`.
- **Right interpreter**: the sidecar must run with the `python3` that sees
  `rclpy` after the startup. If the startup activates a venv that shadows it, the
  sidecar fails; it must detect `ImportError` and show a clear message in the tab.
- **Idempotent startup**: it runs both in the terminal and in the sidecar, so it
  should only prepare the environment, with no processes started and no side
  effects.
- **Socket security**: the Unix socket lives in a directory owned by the user,
  with mode `0600`. The sidecar also authenticates with the session token on
  connect.

Open case: a workspace whose `install/` does not exist yet (not built). The
natural behavior is to inherit the distro's base environment with no overlay and
show it with a warning in the tab.

## 4. UX

- **Tabs or a selector per environment**, with the active tab following the
  workspace selected in the sidebar (plus a "pin" option so it stops following).
- **Always-visible header** with the environment being shown, for example
  `jazzy · domain 3 · 2 workspaces`. This fixes the current problem: the panel
  shows an environment without saying which one.
- **Lazy start**: the sidecar starts only when the tab is opened for the first
  time, and pauses after a while in the background, so Cotton does not keep N
  DDS participants doing discovery for nothing.
- **Activity indicator** per tab (node count or a colored dot) to see which
  environments are alive without opening them.
- **Never overlay two graphs in one view.** Mixing environments with same-named
  nodes on different domains creates exactly the confusion this is meant to fix.

## 5. Phases

1. **Now, cheap**: keep the panel showing Cotton's environment, but add a header
   that states it explicitly.
2. **Sidecar extraction**: move the `rclpy` part out into a sidecar with the event
   protocol, still with a single environment. This is the step that unblocks the
   rest, and it is worth doing before the panel code depends on `rclpy` any
   further.
3. **Sidecar manager** indexed by environment: tabs, lazy start, auto-follow by
   workspace.

## 6. Graph canvas (frontend)

The panel draws the snapshot on a `<canvas>` instead of SVG/DOM, so a few
hundred entities stay interactive:

- force simulation (repulsion, link distance, link strength, centering) with
  fixed defaults; settled positions survive incremental graph updates;
- the view frames the graph once the layout rests, so it never opens oversized;
- labels appear for hubs, for the hovered/selected point and when zooming in;
- hovering highlights a point and its neighbours and dims the rest;
- search keeps one hop around every match;
- selecting a point keeps the whole graph on screen and only dims the points
  that are unrelated to it; clicking a dimmed point moves the focus to it;
- `/rosout`, `/rosout_agg`, `/parameter_events`, `/tf`, `/tf_static` and
  `/clock` are always hidden;
- services and actions are drawn as their own shapes and colours;
- dragging a point pins it and keeps the layout running, so the points linked
  to it follow; double-clicking releases it again.

The simulation runs next to the animation frame on the main thread, which is
fine for the graph sizes ROS usually produces. A Web Worker is the next step if
a deployment ever shows thousands of entities.

## 7. Constraints for the implementation

- The core keeps a `GraphSource` port; `rclpy` lives only in the sidecar, so the
  backend no longer needs a system ROS installation to start.
- No new dependency for the IPC channel: `socket` plus JSON is enough.
- The workspace terminals plan does not need to change for this: Task 7 already
  stores the startup command per workspace, which is the input the sidecar needs.
  Do not add a redundant environment field in the meantime.
