from __future__ import annotations

from types import SimpleNamespace

import pytest

from ros_studio.ros.rate import (
    RateResult,
    ThreadRateSource,
    compute_hz,
    is_best_effort,
    measure_rate,
)
from ros_studio.ros.thread import RosCallError


class FakeQos:
    def __init__(self, reliability: int) -> None:
        self.reliability = reliability


class FakeNode:
    def __init__(self, topics: dict[str, list[str]], publishers: list[object]) -> None:
        self._topics = topics
        self._publishers = publishers

    def get_topic_names_and_types(self) -> list[tuple[str, list[str]]]:
        return list(self._topics.items())

    def get_publishers_info_by_topic(self, topic: str) -> list[object]:
        return self._publishers


def test_compute_hz() -> None:
    assert compute_hz(124, 2.0) == 62.0
    assert compute_hz(0, 2.0) == 0.0


def test_compute_hz_with_empty_window() -> None:
    assert compute_hz(10, 0.0) == 0.0


def test_no_publishers_is_unavailable() -> None:
    node = FakeNode({"/chatter": ["std_msgs/msg/String"]}, [])

    assert measure_rate(node, "/chatter", window_s=0.01) == RateResult(
        available=False, hz=None, window_s=0.01, reason="no_publishers"
    )


def test_unknown_topic_raises_topic_not_found() -> None:
    with pytest.raises(RosCallError) as error:
        measure_rate(FakeNode({}, []), "/missing")

    assert error.value.code == "topic_not_found"


def test_unknown_message_type_is_unavailable() -> None:
    node = FakeNode({"/chatter": ["no_such_pkg/msg/Nope"]}, [object()])

    assert measure_rate(node, "/chatter", window_s=0.01) == RateResult(
        available=False, hz=None, window_s=0.01, reason="type_unavailable"
    )


def test_best_effort_publishers_use_a_best_effort_probe() -> None:
    assert is_best_effort(FakeQos(2)) is True
    assert is_best_effort(FakeQos(1)) is False
    assert is_best_effort(object()) is False


def test_thread_rate_source_names_the_probe_after_the_app_node(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict[str, str] = {}

    def fake_measure(
        _node: object, _topic: str, window_s: float = 2.0, probe_name: str = "ros_studio_rate"
    ) -> RateResult:
        seen["probe_name"] = probe_name
        return RateResult(available=True, hz=1.0, window_s=window_s)

    monkeypatch.setattr("ros_studio.ros.rate.measure_rate", fake_measure)
    ros = SimpleNamespace(node=object(), node_name="ros_studio_42")

    assert ThreadRateSource(ros).measure("/chatter").hz == 1.0
    assert seen["probe_name"] == "ros_studio_42_rate"
