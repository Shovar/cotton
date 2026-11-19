from __future__ import annotations

import asyncio
import contextlib
import json
from dataclasses import replace

from cotton.events import EventBus
from cotton.ros.graph import GraphSource
from cotton.ros.models import GraphSnapshot
from cotton.ros.thread import RosThread

_BACKOFF = (1.0, 2.0, 4.0, 8.0, 16.0, 30.0)


class GraphWatcher:
    """Polls the ROS graph on its own task and publishes only real changes."""

    def __init__(
        self, ros: RosThread, source: GraphSource, bus: EventBus, interval: float = 1.0
    ) -> None:
        self._ros = ros
        self._source = source
        self._bus = bus
        self._interval = interval
        self._snapshot: GraphSnapshot | None = None
        self._key: str | None = None
        self._status: dict[str, object] = {"connected": False, "error": None}
        self._failures = 0
        self._stop = asyncio.Event()
        self._task: asyncio.Task[None] | None = None

    def current(self) -> GraphSnapshot | None:
        return self._snapshot

    def current_status(self) -> dict[str, object]:
        return dict(self._status)

    async def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop.clear()
            self._task = asyncio.create_task(self.run(), name="graph-watcher")

    async def stop(self) -> None:
        self._stop.set()
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    async def run(self) -> None:
        while not self._stop.is_set():
            try:
                candidate = await self._ros.call(self._source.snapshot)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - surfaced as ros.status
                await self._publish_status(False, str(exc))
                await self._wait(_BACKOFF[min(self._failures, len(_BACKOFF) - 1)])
                self._failures += 1
                continue
            self._failures = 0
            await self._publish_status(True, None)
            await self._publish_snapshot(candidate)
            await self._wait(self._interval)

    async def _publish_snapshot(self, candidate: GraphSnapshot) -> None:
        key = json.dumps(candidate.to_dict(), sort_keys=True)
        if key == self._key:
            return
        self._key = key
        revision = 1 if self._snapshot is None else self._snapshot.revision + 1
        self._snapshot = replace(candidate, revision=revision)
        await self._bus.publish("graph.update", self._snapshot.to_dict())

    async def _publish_status(self, connected: bool, error: str | None) -> None:
        status: dict[str, object] = {"connected": connected, "error": error}
        if status == self._status:
            return
        self._status = status
        await self._bus.publish("ros.status", dict(status))

    async def _wait(self, delay: float) -> None:
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(self._stop.wait(), delay)
