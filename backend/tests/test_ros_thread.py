import asyncio
import os
import sys
import threading
import time
import types

import pytest

from cotton.ros.thread import RosCallError, RosCallTimeout, RosThread


class FakeRosThread(RosThread):
    def _setup(self) -> None:
        self.node = object()

    def _spin_once(self, timeout: float) -> None:
        time.sleep(timeout)

    def _teardown(self) -> None:
        pass


async def test_call_returns_result() -> None:
    thread = FakeRosThread(poll_interval=0.01)
    thread.start()
    try:
        assert await thread.call(lambda value: value + 1, 1) == 2
    finally:
        thread.stop()


async def test_call_times_out() -> None:
    thread = FakeRosThread(poll_interval=0.01)
    thread.start()
    try:
        with pytest.raises(RosCallTimeout):
            await thread.call(lambda: time.sleep(0.3), timeout=0.02)
    finally:
        thread.stop()


async def test_function_errors_propagate() -> None:
    thread = FakeRosThread(poll_interval=0.01)
    thread.start()
    try:
        with pytest.raises(ValueError, match="boom"):
            await thread.call(lambda: (_ for _ in ()).throw(ValueError("boom")))
    finally:
        thread.stop()


def test_start_is_idempotent() -> None:
    thread = FakeRosThread(poll_interval=0.01)
    thread.start()
    thread.start()
    try:
        assert sum(t.name.startswith("ros-") for t in threading.enumerate()) == 1
    finally:
        thread.stop()


def test_stop_without_start_is_safe() -> None:
    FakeRosThread(poll_interval=0.01).stop()


async def test_call_before_start_fails() -> None:
    with pytest.raises(RosCallError):
        await FakeRosThread(poll_interval=0.01).call(lambda: 1)


def test_stop_leaves_no_threads() -> None:
    before = len(threading.enumerate())
    thread = FakeRosThread(poll_interval=0.01)
    thread.start()
    thread.stop()
    asyncio.run(asyncio.sleep(0))
    assert len(threading.enumerate()) == before


def test_default_node_name_includes_the_pid() -> None:
    assert RosThread().node_name == f"cotton_{os.getpid()}"


def test_explicit_node_name_is_kept() -> None:
    assert RosThread(node_name="cotton_7").node_name == "cotton_7"


def test_external_rclpy_shutdown_stops_the_spin_loop(monkeypatch: pytest.MonkeyPatch) -> None:
    class ExternalShutdownException(Exception):
        pass

    def shutdown_during_spin(*_args: object, **_kwargs: object) -> None:
        raise ExternalShutdownException

    rclpy = types.ModuleType("rclpy")
    rclpy.__path__ = []  # type: ignore[attr-defined]
    rclpy.spin_once = shutdown_during_spin  # type: ignore[attr-defined]
    executors = types.ModuleType("rclpy.executors")
    executors.ExternalShutdownException = ExternalShutdownException  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rclpy", rclpy)
    monkeypatch.setitem(sys.modules, "rclpy.executors", executors)

    thread = RosThread()
    thread._spin_once(0.01)

    assert thread._stopping.is_set()
