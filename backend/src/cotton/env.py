from __future__ import annotations

import importlib
import os
import shutil
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from cotton import __version__

_MAX_DOMAIN_ID = 232


class RosEnvironmentError(RuntimeError):
    """The active environment cannot run Cotton."""


@dataclass(frozen=True)
class EnvironmentInfo:
    distro: str
    domain_id: int
    rmw: str | None
    workspace: str | None
    ros_version: str | None
    app_version: str


def detect_environment(env: Mapping[str, str] | None = None) -> EnvironmentInfo:
    values = os.environ if env is None else env
    distro = values.get("ROS_DISTRO", "").strip()
    if not distro:
        raise RosEnvironmentError(
            "ROS_DISTRO is not set. Activate a ROS 2 environment first "
            "(pixi shell, source /opt/ros/<distro>/setup.bash, or the Docker image)."
        )

    domain_id = _parse_domain_id(values.get("ROS_DOMAIN_ID", "0"))
    return EnvironmentInfo(
        distro=distro,
        domain_id=domain_id,
        rmw=_optional(values.get("RMW_IMPLEMENTATION")),
        workspace=_workspace(values.get("COLCON_PREFIX_PATH")),
        ros_version=_optional(values.get("ROS_VERSION")),
        app_version=__version__,
    )


def ensure_ros_environment(env: Mapping[str, str] | None = None) -> EnvironmentInfo:
    info = detect_environment(env)
    values = os.environ if env is None else env

    if not values.get("AMENT_PREFIX_PATH", "").strip():
        raise RosEnvironmentError(
            "AMENT_PREFIX_PATH is not set. Activate a ROS 2 environment first "
            f"(source /opt/ros/{info.distro}/setup.bash or the Docker image)."
        )
    if shutil.which("ros2", path=values.get("PATH")) is None:
        raise RosEnvironmentError(
            "The ros2 command is not on PATH. Activate a ROS 2 environment first "
            f"(source /opt/ros/{info.distro}/setup.bash or the Docker image)."
        )
    try:
        importlib.import_module("rclpy")
    except ImportError as exc:
        raise RosEnvironmentError(
            "rclpy is not importable. Cotton must run inside a ROS 2 environment; "
            "create the virtual environment with --system-site-packages and source the "
            f"ROS setup for {info.distro}."
        ) from exc
    return info


def _parse_domain_id(raw: str) -> int:
    try:
        domain_id = int(raw)
    except ValueError as exc:
        raise RosEnvironmentError(
            f"ROS_DOMAIN_ID must be an integer between 0 and {_MAX_DOMAIN_ID}, got {raw!r}."
        ) from exc
    if not 0 <= domain_id <= _MAX_DOMAIN_ID:
        raise RosEnvironmentError(
            f"ROS_DOMAIN_ID must be between 0 and {_MAX_DOMAIN_ID}, got {domain_id}."
        )
    return domain_id


def _workspace(colcon_prefix_path: str | None) -> str | None:
    if not colcon_prefix_path:
        return None
    first = colcon_prefix_path.split(os.pathsep)[0].strip()
    return str(Path(first).parent) if first else None


def _optional(value: str | None) -> str | None:
    stripped = (value or "").strip()
    return stripped or None
