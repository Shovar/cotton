#!/usr/bin/env bash
set -eo pipefail

source "/opt/ros/${ROS_DISTRO:-jazzy}/setup.bash"
if [[ -f /ws/install/setup.bash ]]; then
  source /ws/install/setup.bash
fi

# Containers have no display; turtlesim and other GUI nodes need one.
if [[ -z "${DISPLAY:-}" ]] && command -v Xvfb > /dev/null; then
  Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp &
  export DISPLAY=:99
fi

exec "$@"
