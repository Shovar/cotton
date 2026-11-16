from __future__ import annotations

import asyncio
from collections.abc import Callable

from cotton.events import Event, EventBus
from cotton.ros.models import GraphSnapshot
from cotton.ros.thread import RosCallError
from cotton.ros.watcher import GraphWatcher


def graph_with(revision: int) -> GraphSnapshot:
    return GraphSnapshot(nodes=[], topics=[], services={}, actions={}, revision=revision)


class FakeRos:
    async def call(self, fn: Callable[..., object], *args: object, timeout: float = 5.0) -> object:
        return fn(*args)


class CallbackSource:
    def __init__(self, behaviour: Callable[[int], GraphSnapshot]) -> None:
        self.behaviour = behaviour
        self.calls = 0

    def snapshot(self) -> GraphSnapshot:
        self.calls += 1
        return self.behaviour(self.calls)


async def test_watcher_publishes_only_when_snapshot_changes() -> None:
    bus = EventBus()
    queue = bus.subscribe()
    watcher = GraphWatcher(FakeRos(), CallbackSource(lambda _calls: graph_with(0)), bus, 0.005)

    task = asyncio.create_task(watcher.run())
    await asyncio.sleep(0.06)
    await watcher.stop()
    task.cancel()

    events = [queue.get_nowait() for _ in range(queue.qsize())]
    updates = [event for event in events if event.type == "graph.update"]
    assert len(updates) == 1
    assert updates[0].data["revision"] == 1
    assert watcher.current() == graph_with(1)


async def test_watcher_publishes_every_change_with_increasing_revision() -> None:
    bus = EventBus()
    queue = bus.subscribe()
    watcher = GraphWatcher(FakeRos(), CallbackSource(graph_with), bus, 0.005)

    task = asyncio.create_task(watcher.run())
    await asyncio.sleep(0.05)
    await watcher.stop()
    task.cancel()

    events = [queue.get_nowait() for _ in range(queue.qsize())]
    revisions = [event.data["revision"] for event in events if event.type == "graph.update"]
    assert revisions == list(range(1, len(revisions) + 1))
    assert len(revisions) > 1


async def test_watcher_reports_ros_disconnection() -> None:
    class FailingRos:
        async def call(
            self, fn: Callable[..., object], *args: object, timeout: float = 5.0
        ) -> object:
            raise RosCallError("dds down")

    bus = EventBus()
    queue = bus.subscribe()
    watcher = GraphWatcher(FailingRos(), CallbackSource(lambda _calls: graph_with(0)), bus, 0.005)

    task = asyncio.create_task(watcher.run())
    event = await asyncio.wait_for(queue.get(), timeout=0.5)
    await watcher.stop()
    task.cancel()

    assert event == Event("ros.status", {"connected": False, "error": "dds down"})
    assert watcher.current_status() == {"connected": False, "error": "dds down"}


async def test_watcher_recovers_after_a_failed_poll() -> None:
    class FlakyRos:
        calls = 0

        async def call(
            self, fn: Callable[..., object], *args: object, timeout: float = 5.0
        ) -> object:
            self.calls += 1
            if self.calls == 1:
                raise RosCallError("dds down")
            return fn(*args)

    bus = EventBus()
    queue = bus.subscribe()
    watcher = GraphWatcher(FlakyRos(), CallbackSource(lambda _calls: graph_with(0)), bus, 0.005)

    task = asyncio.create_task(watcher.run())
    first = await asyncio.wait_for(queue.get(), timeout=0.5)
    await asyncio.wait_for(queue.get(), timeout=2.0)
    await asyncio.wait_for(queue.get(), timeout=0.5)
    await watcher.stop()
    task.cancel()

    assert first.data["connected"] is False
    assert watcher.current_status() == {"connected": True, "error": None}
    assert watcher.current() is not None


async def test_stop_cancels_the_running_task() -> None:
    bus = EventBus()
    watcher = GraphWatcher(FakeRos(), CallbackSource(lambda _calls: graph_with(0)), bus, 0.005)

    await watcher.start()
    await asyncio.sleep(0.01)
    await watcher.stop()

    assert watcher._task is None
