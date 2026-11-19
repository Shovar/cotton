# Known limitations and deferred work

Notes for limitations found while designing other features. They are recorded so
they are not rediscovered later; none of them is scheduled work yet.

## ROS graph panels are scoped to Cotton's own process

Cotton's graph, topic detail, parameter editor and rate measurement describe the
ROS 2 environment the Cotton backend was started in, not the environment of any
terminal:

- `detect_environment()` (`backend/src/cotton/env.py`) reads `ROS_DISTRO`,
  `ROS_DOMAIN_ID` and `COLCON_PREFIX_PATH` once at startup.
- `RosThread` owns a single `rclpy` context and calls `rclpy.init()`
  (`backend/src/cotton/ros/thread.py`); `cli.py` builds one `RosThread` and
  `routes_graph`, `routes_params` and `routes_topics` from it.
- Terminal sessions are separate processes and are not consulted by those
  routes.

Consequence once terminals are grouped per ROS workspace: terminal tabs get the
environment of their workspace, but the graph keeps showing the environment
Cotton was launched in. A node started from a terminal in a workspace with a
different overlay, `ROS_DOMAIN_ID` or `RMW_IMPLEMENTATION` will not appear in
the graph, and parameter/rate actions will not reach it. Giving each terminal
its own environment does not change this.

Direction for a future fix: graph tabs keyed by ROS environment (distro, domain,
RMW, discovery range) with one sidecar process per environment. That design, its
phases and its constraints are in `docs/ros-graph-environments.md`.

## Workspaces carry no captured environment

Registering a workspace does not capture or persist an environment. The
workspace startup command is the only mechanism: it is shell text written into
each new shell of that workspace, visible and editable, and it is what sources
`install/setup.bash`.

Consequences:

- A terminal started with a one-off argv `command` (the existing
  `POST /api/terminals` path) still inherits Cotton's environment, so it may not
  see a different workspace overlay or `ROS_DOMAIN_ID`. That path is unchanged on
  purpose.
- Shell state that an environment cannot hold (functions, aliases, completions)
  is fine: the startup command runs inside the shell, not as an argv list.
- The ROS graph sidecar will reuse that same startup command to derive its
  environment, so there is one source of truth and no env snapshot on disk. See
  `docs/ros-graph-environments.md`.
