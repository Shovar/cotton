from __future__ import annotations

import time
from dataclasses import asdict, dataclass
from typing import Any, Protocol

from ros_studio.ros.graph import NodeLike
from ros_studio.ros.thread import RosCallError, RosThread


@dataclass(frozen=True)
class RateResult:
    available: bool
    hz: float | None
    window_s: float
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class RateSource(Protocol):
    def measure(self, topic: str, window_s: float = 2.0) -> RateResult: ...


def compute_hz(count: int, window_s: float) -> float:
    return round(count / window_s, 1) if window_s > 0 else 0.0


_BEST_EFFORT_RELIABILITY = 2


def is_best_effort(publisher_qos: object) -> bool:
    """Mirror the publisher reliability so a probe can count best-effort topics."""
    return getattr(publisher_qos, "reliability", None) == _BEST_EFFORT_RELIABILITY


def measure_rate(
    node: NodeLike, topic: str, window_s: float = 2.0, probe_name: str = "ros_studio_rate"
) -> RateResult:
    """Count the messages published on a topic during a short window."""
    types = dict(node.get_topic_names_and_types()).get(topic)
    if types is None:
        raise RosCallError(f"topic {topic} does not exist", code="topic_not_found")
    publishers = node.get_publishers_info_by_topic(topic)
    if not publishers:
        return RateResult(available=False, hz=None, window_s=window_s, reason="no_publishers")
    message_type = _message_type(types[0])
    if message_type is None:
        return RateResult(available=False, hz=None, window_s=window_s, reason="type_unavailable")
    publisher_qos = getattr(publishers[0], "qos_profile", 10)
    count = _count_messages(topic, message_type, publisher_qos, window_s, probe_name)
    return RateResult(available=True, hz=compute_hz(count, window_s), window_s=window_s)


class ThreadRateSource:
    """Resolves the ROS node lazily so the router can be built before startup."""

    def __init__(self, ros: RosThread) -> None:
        self._ros = ros

    def measure(self, topic: str, window_s: float = 2.0) -> RateResult:
        node = self._ros.node
        if node is None:
            raise RosCallError("the ROS thread is not running")
        return measure_rate(node, topic, window_s, probe_name=f"{self._ros.node_name}_rate")


def _message_type(type_name: str) -> type | None:
    from rosidl_runtime_py.utilities import get_message

    try:
        return get_message(type_name)
    except (AttributeError, ImportError, ModuleNotFoundError, ValueError):
        return None


def _count_messages(
    topic: str, message_type: type, publisher_qos: Any, window_s: float, probe_name: str
) -> int:
    import rclpy
    from rclpy.qos import QoSProfile, ReliabilityPolicy

    reliability = (
        ReliabilityPolicy.BEST_EFFORT
        if is_best_effort(publisher_qos)
        else ReliabilityPolicy.RELIABLE
    )
    qos = QoSProfile(depth=10, reliability=reliability)
    count = 0

    def on_message(_message: Any) -> None:
        nonlocal count
        count += 1

    probe = rclpy.create_node(probe_name)
    try:
        probe.create_subscription(message_type, topic, on_message, qos)
        deadline = time.monotonic() + window_s
        while time.monotonic() < deadline:
            rclpy.spin_once(probe, timeout_sec=0.05)
    finally:
        probe.destroy_node()
    return count
