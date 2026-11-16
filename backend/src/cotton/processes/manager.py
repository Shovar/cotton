from __future__ import annotations

import asyncio
import contextlib
import os
import re
import signal
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

from cotton.events import EventBus
from cotton.processes.logs import LogBuffer, LogFileWriter
from cotton.processes.models import LogStream, ProcessRecord, ProcessSpec

_ACTIVE = frozenset({"starting", "running", "stopping"})
_SAFE_ID = re.compile(r"^[A-Za-z0-9_.-]+$")
_POLL_SECONDS = 0.02


class ProcessNotFound(RuntimeError):
    """No process is known under this id."""


class ProcessConflict(RuntimeError):
    """A process with this id is already active."""


class ProcessRegistryPort(Protocol):
    """The persistence capability the manager needs; SQLite owns the adapter."""

    def save(self, record: ProcessRecord) -> None: ...

    def delete(self, process_id: str) -> None: ...

    def all(self) -> list[ProcessRecord]: ...


@dataclass(frozen=True)
class StopTimeouts:
    interrupt: float = 5.0
    terminate: float = 3.0


class ProcessManager:
    """Starts child processes in their own session and keeps their state and logs."""

    def __init__(
        self,
        bus: EventBus,
        logs_dir: Path,
        registry: ProcessRegistryPort | None = None,
        stop_timeouts: StopTimeouts | None = None,
        env: Mapping[str, str] | None = None,
    ) -> None:
        self._bus = bus
        self._logs_dir = Path(logs_dir)
        self._registry = registry
        self._stop_timeouts = stop_timeouts or StopTimeouts()
        self._env = None if env is None else dict(env)
        self._records: dict[str, ProcessRecord] = {}
        self._processes: dict[str, asyncio.subprocess.Process] = {}
        self._buffers: dict[str, LogBuffer] = {}
        self._writers: dict[str, LogFileWriter] = {}
        self._readers: dict[str, list[asyncio.Task[None]]] = {}
        self._waiters: dict[str, asyncio.Task[None]] = {}

    async def start(self, spec: ProcessSpec) -> ProcessRecord:
        self._check_id(spec.id)
        if not spec.argv:
            raise ValueError("argv must contain at least one element")
        current = self._records.get(spec.id)
        if current is not None and current.state in _ACTIVE:
            raise ProcessConflict(f"process {spec.id} is already active")

        record = ProcessRecord(
            id=spec.id,
            spec=spec,
            state="starting",
            pid=None,
            pgid=None,
            started_at=datetime.now(timezone.utc),
        )
        self._records[spec.id] = record
        self._buffers[spec.id] = LogBuffer(process_id=spec.id)
        self._writers[spec.id] = LogFileWriter(self._logs_dir / f"{spec.id}.log")
        await self._publish_state(record)

        try:
            process = await asyncio.create_subprocess_exec(
                *spec.argv,
                cwd=spec.cwd,
                env=self._environment(spec),
                start_new_session=True,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except OSError as exc:
            record.state = "failed"
            record.error = _startup_error(spec.argv[0], exc)
            if self._registry is not None:
                self._registry.delete(spec.id)
            await self._publish_state(record)
            return record

        assert process.stdout is not None and process.stderr is not None
        record.pid = process.pid
        # start_new_session makes the child the leader of a fresh process group.
        record.pgid = process.pid
        record.state = "running"
        self._processes[spec.id] = process
        self._readers[spec.id] = [
            asyncio.create_task(self._read(spec.id, "stdout", process.stdout)),
            asyncio.create_task(self._read(spec.id, "stderr", process.stderr)),
        ]
        self._waiters[spec.id] = asyncio.create_task(self._wait(spec.id, process))
        if self._registry is not None:
            self._registry.save(record)
        await self._publish_state(record)
        return record

    async def stop(self, process_id: str) -> ProcessRecord:
        record = self.get(process_id)
        if record.state not in _ACTIVE:
            return record

        record.state = "stopping"
        await self._publish_state(record)
        if record.pgid is not None and _group_alive(record.pgid):
            await self._terminate_group(record.pgid)

        waiter = self._waiters.get(process_id)
        if waiter is not None:
            with contextlib.suppress(asyncio.CancelledError):
                await waiter
        else:
            record.state = "exited"
            if self._registry is not None:
                self._registry.delete(process_id)
            await self._publish_state(record)
        return record

    async def restart(self, process_id: str) -> ProcessRecord:
        record = self.get(process_id)
        if record.state in _ACTIVE:
            await self.stop(process_id)
        return await self.start(record.spec)

    async def close(self, process_id: str) -> ProcessRecord:
        record = self.get(process_id)
        if record.state in _ACTIVE:
            record = await self.stop(process_id)
        self._forget(process_id)
        await self._bus.publish("process.removed", {"id": process_id})
        return record

    async def shutdown(self) -> None:
        """Stop every active process in reverse start order."""
        for process_id in reversed(list(self._records)):
            record = self._records.get(process_id)
            if record is not None and record.state in _ACTIVE:
                await self.stop(process_id)

    async def recover(self) -> list[ProcessRecord]:
        """Adopt processes that survived a backend restart; drop dead registry rows."""
        if self._registry is None:
            return []
        recovered: list[ProcessRecord] = []
        for record in self._registry.all():
            if not _pid_alive(record):
                self._registry.delete(record.id)
                continue
            if record.id in self._records:
                continue
            record.state = "running"
            record.recovered = True
            record.exit_code = None
            record.error = None
            self._records[record.id] = record
            self._buffers[record.id] = LogBuffer(process_id=record.id)
            self._writers[record.id] = LogFileWriter(self._logs_dir / f"{record.id}.log")
            recovered.append(record)
            await self._publish_state(record)
        return recovered

    def list(self) -> list[ProcessRecord]:
        return list(self._records.values())

    def get(self, process_id: str) -> ProcessRecord:
        record = self._records.get(process_id)
        if record is None:
            raise ProcessNotFound(f"unknown process: {process_id}")
        return record

    def logs(self, process_id: str) -> LogBuffer:
        self.get(process_id)
        return self._buffers.setdefault(process_id, LogBuffer(process_id=process_id))

    async def _read(self, process_id: str, stream: LogStream, reader: asyncio.StreamReader) -> None:
        buffer = self._buffers[process_id]
        writer = self._writers[process_id]
        while True:
            raw = await reader.readline()
            if not raw:
                return
            text = raw.decode("utf-8", errors="replace").rstrip("\r\n")
            line = buffer.append(stream, text)
            writer.write(line)
            await self._bus.publish("process.log", line.to_dict())

    async def _wait(self, process_id: str, process: asyncio.subprocess.Process) -> None:
        exit_code = await process.wait()
        readers = self._readers.get(process_id, [])
        if readers:
            await asyncio.gather(*readers, return_exceptions=True)
        record = self._records.get(process_id)
        if record is None:
            return
        record.exit_code = exit_code
        if record.state == "stopping" or exit_code == 0:
            record.state = "exited"
        else:
            record.state = "failed"
        if self._registry is not None:
            self._registry.delete(process_id)
        await self._publish_state(record)

    async def _terminate_group(self, pgid: int) -> None:
        _signal_group(pgid, signal.SIGINT)
        if await _group_gone(pgid, self._stop_timeouts.interrupt):
            return
        _signal_group(pgid, signal.SIGTERM)
        if await _group_gone(pgid, self._stop_timeouts.terminate):
            return
        _signal_group(pgid, signal.SIGKILL)
        await _group_gone(pgid, 1.0)

    def _environment(self, spec: ProcessSpec) -> dict[str, str]:
        base = dict(os.environ if self._env is None else self._env)
        base.update(spec.env)
        return base

    def _check_id(self, process_id: str) -> None:
        if not _SAFE_ID.fullmatch(process_id):
            raise ValueError(f"invalid process id: {process_id!r}")

    def _forget(self, process_id: str) -> None:
        for collection in (
            self._records,
            self._buffers,
            self._writers,
            self._processes,
            self._readers,
            self._waiters,
        ):
            collection.pop(process_id, None)
        if self._registry is not None:
            self._registry.delete(process_id)

    async def _publish_state(self, record: ProcessRecord) -> None:
        await self._bus.publish("process.state", record.to_dict())


def _startup_error(command: str, exc: OSError) -> str:
    if isinstance(exc, FileNotFoundError):
        return f"{command}: command not found"
    if isinstance(exc, PermissionError):
        return f"{command}: permission denied"
    return f"failed to start {command}: {exc}"


def _signal_group(pgid: int, sig: int) -> None:
    with contextlib.suppress(ProcessLookupError):
        os.killpg(pgid, sig)


def _group_alive(pgid: int) -> bool:
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


async def _group_gone(pgid: int, timeout: float) -> bool:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + max(0.0, timeout)
    while _group_alive(pgid):
        if loop.time() >= deadline:
            return not _group_alive(pgid)
        await asyncio.sleep(_POLL_SECONDS)
    return True


def _pid_alive(record: ProcessRecord) -> bool:
    if record.pid is None:
        return False
    try:
        os.kill(record.pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        pass
    if record.pgid is None:
        return True
    try:
        return os.getpgid(record.pid) == record.pgid
    except ProcessLookupError:
        return False


__all__ = [
    "ProcessConflict",
    "ProcessManager",
    "ProcessNotFound",
    "ProcessRegistryPort",
    "StopTimeouts",
]
