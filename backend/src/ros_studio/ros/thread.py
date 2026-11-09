from __future__ import annotations

import asyncio
import concurrent.futures
import queue
import threading
from collections.abc import Callable
from typing import Any, TypeVar

T = TypeVar("T")

Job = tuple[Callable[..., Any], tuple[Any, ...], "concurrent.futures.Future[Any]"]


class RosCallError(RuntimeError):
    """A ROS call could not be executed; `code` names the API error when known."""

    def __init__(self, message: str, code: str | None = None) -> None:
        super().__init__(message)
        self.code = code


class RosCallTimeout(RosCallError):
    """A ROS call did not finish within its timeout."""


class RosThread:
    """Single owner of the rclpy node and every rclpy call."""

    def __init__(self, node_name: str = "ros_studio", poll_interval: float = 0.05) -> None:
        self.node_name = node_name
        self.poll_interval = poll_interval
        self.node: Any = None
        self._jobs: queue.Queue[Job] = queue.Queue()
        self._thread: threading.Thread | None = None
        self._ready = threading.Event()
        self._stopping = threading.Event()
        self._startup_error: BaseException | None = None

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._ready.clear()
        self._stopping.clear()
        self._startup_error = None
        self._thread = threading.Thread(target=self._run, name=f"ros-{self.node_name}", daemon=True)
        self._thread.start()
        if not self._ready.wait(timeout=5.0):
            raise RosCallError("timed out while starting the ROS thread")
        if self._startup_error is not None:
            self._thread = None
            raise RosCallError(f"failed to start the ROS thread: {self._startup_error}")

    def stop(self) -> None:
        thread = self._thread
        if thread is None:
            return
        self._stopping.set()
        thread.join(timeout=10.0)
        if thread.is_alive():
            raise RosCallError("the ROS thread did not stop within 10 seconds")
        self._thread = None

    @property
    def is_running(self) -> bool:
        return (
            self._thread is not None
            and self._thread.is_alive()
            and self._ready.is_set()
            and not self._stopping.is_set()
        )

    async def call(self, fn: Callable[..., T], *args: Any, timeout: float = 5.0) -> T:
        if not self.is_running:
            raise RosCallError("the ROS thread is not running")
        future: concurrent.futures.Future[T] = concurrent.futures.Future()
        self._jobs.put((fn, args, future))
        try:
            return await asyncio.wait_for(asyncio.wrap_future(future), timeout)
        except TimeoutError as exc:
            raise RosCallTimeout(f"ROS call timed out after {timeout}s") from exc

    def _run(self) -> None:
        try:
            self._setup()
        except BaseException as exc:  # noqa: BLE001 - reported to the caller
            self._startup_error = exc
            self._ready.set()
            return
        self._ready.set()
        try:
            while not self._stopping.is_set():
                self._drain_jobs()
                self._spin_once(self.poll_interval)
        finally:
            self._fail_pending()
            self._teardown()

    def _drain_jobs(self) -> None:
        while True:
            try:
                fn, args, future = self._jobs.get_nowait()
            except queue.Empty:
                return
            if not future.set_running_or_notify_cancel():
                continue
            try:
                future.set_result(fn(*args))
            except BaseException as exc:  # noqa: BLE001 - delivered through the future
                future.set_exception(exc)

    def _fail_pending(self) -> None:
        while True:
            try:
                _fn, _args, future = self._jobs.get_nowait()
            except queue.Empty:
                return
            if future.set_running_or_notify_cancel():
                future.set_exception(RosCallError("the ROS thread stopped"))

    def _setup(self) -> None:
        import rclpy

        rclpy.init()
        self.node = rclpy.create_node(self.node_name)

    def _spin_once(self, timeout: float) -> None:
        import rclpy

        rclpy.spin_once(self.node, timeout_sec=timeout)

    def _teardown(self) -> None:
        import rclpy

        if self.node is not None:
            self.node.destroy_node()
            self.node = None
        if rclpy.ok():
            rclpy.shutdown()
