#!/usr/bin/env bash
# Development entry point: get a shell with the ROS 2 environment and the
# project virtualenv active, then run ROS Studio. Any argument is forwarded to
# the `ros-studio` CLI.
#
#   scripts/dev.sh
#   scripts/dev.sh --port 8111 --token dev-token
#   ROS_SETUP=~/ros2_ws/install/setup.bash scripts/dev.sh
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# 1. ROS 2 environment: use the active one, or source ROS_SETUP (any setup.sh
#    from apt, RoboStack/pixi, or a colcon workspace), or the default apt path.
if ! command -v ros2 >/dev/null 2>&1; then
  setup="${ROS_SETUP:-}"
  if [[ -z "$setup" && -n "${ROS_DISTRO:-}" && -f "/opt/ros/${ROS_DISTRO}/setup.bash" ]]; then
    setup="/opt/ros/${ROS_DISTRO}/setup.bash"
  fi
  if [[ -z "$setup" ]]; then
    echo "dev: no ROS 2 environment found." >&2
    echo "dev: activate one first, or pass its setup script:" >&2
    echo "dev:   ROS_SETUP=/path/to/setup.bash scripts/dev.sh" >&2
    exit 2
  fi
  # ROS setup scripts are not written for `set -u`.
  set +u
  # shellcheck disable=SC1090
  source "$setup"
  set -u
fi

# 2. Project virtualenv (created with the instructions in README.md).
if [[ ! -f .venv/bin/activate ]]; then
  echo "dev: .venv is missing. Create it first:" >&2
  echo "dev:   python3 -m venv .venv --system-site-packages && source .venv/bin/activate" >&2
  echo "dev:   pip install -e '.[dev]'" >&2
  exit 2
fi
# shellcheck disable=SC1091
source .venv/bin/activate

# 3. ROS setup scripts prepend their own site-packages to PYTHONPATH, which
#    would shadow the virtualenv's packages (e.g. typing_extensions on
#    RoboStack). Put the virtualenv back in front.
venv_site="$(python -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')"
export PYTHONPATH="${venv_site}${PYTHONPATH:+:${PYTHONPATH}}"

# 4. Serve the current frontend: the backend reads the compiled SPA from
#    backend/src/ros_studio/web. Rebuild when the sources are newer and copy the
#    result, so dev.sh never serves a stale bundle.
spa_src="$repo_root/frontend/dist"
spa_dst="$repo_root/backend/src/ros_studio/web"
# shortcut: only frontend/src and index.html trigger a rebuild; include the rest
# of the frontend config here if a change to it must also rebuild.
if [[ ! -f "$spa_src/index.html" ]] ||
  [[ -n "$(find "$repo_root/frontend/src" "$repo_root/frontend/index.html" -newer "$spa_src/index.html" -print -quit)" ]]; then
  (cd "$repo_root/frontend" && npm run build)
fi
if [[ ! -f "$spa_dst/index.html" ]] || [[ "$spa_src/index.html" -nt "$spa_dst/index.html" ]]; then
  rm -rf "$spa_dst"
  cp -R "$spa_src" "$spa_dst"
fi

exec ros-studio "$@"
