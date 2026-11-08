import importlib

import pytest

from ros_studio.env import (
    EnvironmentInfo,
    RosEnvironmentError,
    detect_environment,
    ensure_ros_environment,
)


def test_detects_environment() -> None:
    info = detect_environment(
        {
            "ROS_DISTRO": "jazzy",
            "ROS_DOMAIN_ID": "7",
            "RMW_IMPLEMENTATION": "rmw_cyclonedds_cpp",
            "COLCON_PREFIX_PATH": "/ws/install",
            "ROS_VERSION": "2",
        }
    )
    assert (info.distro, info.domain_id, info.rmw) == ("jazzy", 7, "rmw_cyclonedds_cpp")
    assert info.workspace == "/ws"
    assert info.ros_version == "2"


def test_defaults_are_optional() -> None:
    info = detect_environment({"ROS_DISTRO": "humble"})
    assert info == EnvironmentInfo(
        distro="humble",
        domain_id=0,
        rmw=None,
        workspace=None,
        ros_version=None,
        app_version="0.1.0",
    )


def test_workspace_uses_first_colcon_prefix() -> None:
    info = detect_environment(
        {"ROS_DISTRO": "jazzy", "COLCON_PREFIX_PATH": "/ws/install:/other/install"}
    )
    assert info.workspace == "/ws"


def test_missing_distro_is_actionable() -> None:
    with pytest.raises(RosEnvironmentError, match="ROS_DISTRO"):
        detect_environment({})


def test_invalid_domain_is_rejected() -> None:
    with pytest.raises(RosEnvironmentError, match="ROS_DOMAIN_ID"):
        detect_environment({"ROS_DISTRO": "jazzy", "ROS_DOMAIN_ID": "abc"})


def test_out_of_range_domain_is_rejected() -> None:
    with pytest.raises(RosEnvironmentError, match="ROS_DOMAIN_ID"):
        detect_environment({"ROS_DISTRO": "jazzy", "ROS_DOMAIN_ID": "999"})


def test_ensure_requires_ament_prefix() -> None:
    with pytest.raises(RosEnvironmentError, match="AMENT_PREFIX_PATH"):
        ensure_ros_environment({"ROS_DISTRO": "jazzy"})


def test_ensure_requires_ros2_on_path() -> None:
    env = {"ROS_DISTRO": "jazzy", "AMENT_PREFIX_PATH": "/opt/ros/jazzy", "PATH": ""}
    with pytest.raises(RosEnvironmentError, match="ros2"):
        ensure_ros_environment(env)


def test_ensure_requires_rclpy(monkeypatch: pytest.MonkeyPatch) -> None:
    env = {"ROS_DISTRO": "jazzy", "AMENT_PREFIX_PATH": "/opt/ros/jazzy", "PATH": "/bin"}
    monkeypatch.setattr("ros_studio.env.shutil.which", lambda *_args, **_kwargs: "/bin/ros2")

    def missing(_name: str) -> None:
        raise ImportError("no rclpy")

    monkeypatch.setattr(importlib, "import_module", missing)
    with pytest.raises(RosEnvironmentError, match="rclpy"):
        ensure_ros_environment(env)


def test_ensure_returns_environment_when_ros_is_present(monkeypatch: pytest.MonkeyPatch) -> None:
    env = {"ROS_DISTRO": "jazzy", "AMENT_PREFIX_PATH": "/opt/ros/jazzy", "PATH": "/bin"}
    monkeypatch.setattr("ros_studio.env.shutil.which", lambda *_args, **_kwargs: "/bin/ros2")
    monkeypatch.setattr(importlib, "import_module", lambda _name: object())
    assert ensure_ros_environment(env).distro == "jazzy"
