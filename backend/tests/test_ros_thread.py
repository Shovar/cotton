import asyncio
import threading
import time

import pytest

from ros_studio.ros.thread import RosCallError, RosCallTimeout, RosThread


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
