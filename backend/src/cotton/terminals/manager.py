from __future__ import annotations

import asyncio
import base64
import builtins
import contextlib
import logging
import os
import uuid
from collections import deque
from collections.abc import Mapping, Sequence
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

from cotton.events import EventBus
from cotton.terminals.models import (
    TerminalChunk,
    TerminalKind,
    TerminalRecord,
    TerminalSpec,
    TerminalState,
)
from cotton.terminals.ports import PtySession, PtySpawner

_log = logging.getLogger(__name__)


class TerminalNotFound(RuntimeError):
    """No terminal session is known under this id."""


class TerminalBusy(RuntimeError):
    """A terminal has an active foreground command."""


class TerminalCloseFailed(RuntimeError):
    """A terminal process could not be fully terminated."""


class TerminalManager:
    def __init__(
        self,
        bus: EventBus,
        spawner: PtySpawner,
        scrollback_bytes: int = 65536,
        startup_grace_seconds: float = 2.0,
    ) -> None:
        if scrollback_bytes < 1:
            raise ValueError("scrollback_bytes must be positive")
        self._bus = bus
        self._spawner = spawner
        self._scrollback_bytes = scrollback_bytes
        self._startup_grace_seconds = startup_grace_seconds
        self._first_output: dict[str, asyncio.Event] = {}
        self._injectors: dict[str, asyncio.Task[None]] = {}
        self._records: dict[str, TerminalRecord] = {}
        self._sessions: dict[str, PtySession] = {}
        self._readers: dict[str, asyncio.Task[None]] = {}
        self._chunks: dict[str, deque[TerminalChunk]] = {}
        self._buffer_sizes: dict[str, int] = {}
        self._sequences: dict[str, int] = {}

    async def start(
        self,
        argv: Sequence[str] | None = None,
        *,
        workspace_id: str,
        group_id: str,
        cwd: Path | None = None,
        env: Mapping[str, str] | None = None,
        initial_input: str | None = None,
    ) -> TerminalRecord:
        kind: TerminalKind = "shell" if argv is None else "command"
        command = tuple(argv) if argv is not None else (os.environ.get("SHELL") or "/bin/sh",)
        effective_env = dict(os.environ)
        effective_env.update(env or {})
        spec = TerminalSpec(
            id=f"t_{uuid.uuid4().hex}",
            kind=kind,
            argv=command,
            cwd=Path.cwd() if cwd is None else Path(cwd),
            env=effective_env,
            workspace_id=workspace_id,
            group_id=group_id,
        )
        record = TerminalRecord(
            spec=spec,
            state=TerminalState.STARTING,
            pid=None,
            started_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            exit_code=None,
            error=None,
        )
        self._records[spec.id] = record
        self._chunks[spec.id] = deque()
        self._buffer_sizes[spec.id] = 0
        self._sequences[spec.id] = 0
        await self._publish_state(record)

        try:
            session = await self._spawner.spawn(spec.argv, spec.cwd, spec.env)
        except (OSError, ValueError) as exc:
            command_name = spec.argv[0] if spec.argv else "terminal"
            record = replace(
                record,
                state=TerminalState.FAILED,
                error=f"failed to start {command_name}: {exc}",
            )
            self._records[spec.id] = record
            await self._publish_state(record)
            return record

        self._sessions[spec.id] = session
        record = replace(record, state=TerminalState.RUNNING, pid=session.pid)
        self._records[spec.id] = record
        await self._publish_state(record)
        if kind == "shell" and initial_input:
            first_output = asyncio.Event()
            self._first_output[spec.id] = first_output
            self._injectors[spec.id] = asyncio.create_task(
                self._inject_initial_input(spec.id, session, initial_input, first_output)
            )
        self._readers[spec.id] = asyncio.create_task(self._read_output(spec.id, session))
        return record

    def list(self, workspace_id: str | None = None) -> builtins.list[TerminalRecord]:
        records = [
            record
            for record in self._records.values()
            if workspace_id in {None, record.spec.workspace_id}
        ]
        return sorted(records, key=lambda record: record.started_at or "")

    async def assign(self, terminal_id: str, group_id: str) -> TerminalRecord:
        record = self.get(terminal_id)
        updated = replace(record, spec=replace(record.spec, group_id=group_id))
        self._records[terminal_id] = updated
        await self._publish_state(updated)
        return updated

    def get(self, terminal_id: str) -> TerminalRecord:
        record = self._records.get(terminal_id)
        if record is None:
            raise TerminalNotFound(f"unknown terminal: {terminal_id}")
        return record

    def output_since(self, terminal_id: str, sequence: int) -> builtins.list[TerminalChunk]:
        self.get(terminal_id)
        return [chunk for chunk in self._chunks[terminal_id] if chunk.sequence > sequence]

    async def write_input(self, terminal_id: str, data: bytes) -> None:
        await self._session_for_control(terminal_id).write(data)

    async def resize(self, terminal_id: str, cols: int, rows: int) -> None:
        if not 1 <= cols <= 1000 or not 1 <= rows <= 1000:
            raise ValueError("terminal dimensions must be between 1 and 1000")
        await self._session_for_control(terminal_id).resize(cols, rows)

    def has_foreground_job(self, terminal_id: str) -> bool:
        record = self.get(terminal_id)
        if record.state is not TerminalState.RUNNING or record.spec.kind != "shell":
            return False
        session = self._sessions.get(terminal_id)
        if session is None:
            return False
        try:
            return session.has_foreground_job()
        except (NotImplementedError, OSError):
            return True

    async def close(self, terminal_id: str, force: bool = False) -> TerminalRecord:
        record = self.get(terminal_id)
        session = self._sessions.get(terminal_id)
        if session is None:
            return record
        if not force and self._is_busy(record, session):
            raise TerminalBusy(f"terminal {terminal_id} has an active command")

        reader = self._readers.get(terminal_id)
        if reader is not None and not reader.done():
            reader.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await reader
        try:
            exit_code = await session.close()
        except PermissionError as exc:
            self._sessions.pop(terminal_id, None)
            self._readers.pop(terminal_id, None)
            record = replace(record, state=TerminalState.FAILED, error=str(exc))
            self._records[terminal_id] = record
            await self._publish_state(record)
            raise TerminalCloseFailed(str(exc)) from exc
        await self._cancel_injector(terminal_id)
        self._sessions.pop(terminal_id, None)
        self._readers.pop(terminal_id, None)
        record = replace(record, state=TerminalState.EXITED, exit_code=exit_code)
        self._records[terminal_id] = record
        await self._publish_state(record)
        return record

    async def discard(self, terminal_id: str) -> None:
        self.get(terminal_id)
        await self._bus.publish("terminal.removed", {"id": terminal_id})
        await self._cancel_injector(terminal_id)
        self._records.pop(terminal_id, None)
        self._sessions.pop(terminal_id, None)
        self._readers.pop(terminal_id, None)
        self._chunks.pop(terminal_id, None)
        self._buffer_sizes.pop(terminal_id, None)
        self._sequences.pop(terminal_id, None)

    async def shutdown(self) -> None:
        for terminal_id in reversed(tuple(self._sessions)):
            try:
                await self.close(terminal_id, force=True)
            except TerminalCloseFailed as exc:
                _log.warning("Failed to close terminal %s during shutdown: %s", terminal_id, exc)

    async def _cancel_injector(self, terminal_id: str) -> None:
        self._first_output.pop(terminal_id, None)
        injector = self._injectors.pop(terminal_id, None)
        if injector is None or injector.done():
            return
        injector.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await injector

    def _session_for_control(self, terminal_id: str) -> PtySession:
        record = self.get(terminal_id)
        session = self._sessions.get(terminal_id)
        if record.state is not TerminalState.RUNNING or session is None:
            raise RuntimeError(f"terminal {terminal_id} is not running")
        return session

    def _is_busy(self, record: TerminalRecord, session: PtySession) -> bool:
        if record.state is not TerminalState.RUNNING:
            return False
        if record.spec.kind == "command":
            return True
        try:
            return session.has_foreground_job()
        except (NotImplementedError, OSError):
            return True

    async def _inject_initial_input(
        self,
        terminal_id: str,
        session: PtySession,
        text: str,
        first_output: asyncio.Event,
    ) -> None:
        """Write the saved startup once the shell is ready to read it.

        A slow `.bashrc` would swallow text written before the first prompt, so
        the write waits for that first chunk and falls back to a short grace.
        """
        try:
            await asyncio.wait_for(first_output.wait(), timeout=self._startup_grace_seconds)
        except asyncio.TimeoutError:
            pass
        finally:
            self._first_output.pop(terminal_id, None)
        if self._sessions.get(terminal_id) is not session:
            return
        try:
            await session.write((text + "\n").encode())
        except OSError as exc:
            _log.warning("Failed to inject the startup input into %s: %s", terminal_id, exc)

    async def _read_output(self, terminal_id: str, session: PtySession) -> None:
        try:
            while True:
                data = await session.read()
                if data is None:
                    break
                if not data:
                    continue
                first_output = self._first_output.get(terminal_id)
                if first_output is not None:
                    first_output.set()
                chunk = self._retain_output(terminal_id, data)
                await self._bus.publish(
                    "terminal.output",
                    {
                        "id": terminal_id,
                        "sequence": chunk.sequence,
                        "data": base64.b64encode(data).decode("ascii"),
                    },
                )
            exit_code = await session.close()
        except OSError as exc:
            record = replace(
                self.get(terminal_id),
                state=TerminalState.FAILED,
                error=f"terminal I/O failed: {exc}",
            )
            self._records[terminal_id] = record
            await self._publish_state(record)
            await session.close()
            self._sessions.pop(terminal_id, None)
            self._readers.pop(terminal_id, None)
            return

        record = replace(
            self.get(terminal_id),
            state=TerminalState.EXITED,
            exit_code=exit_code,
        )
        self._records[terminal_id] = record
        await self._publish_state(record)
        self._first_output.pop(terminal_id, None)
        self._sessions.pop(terminal_id, None)
        self._readers.pop(terminal_id, None)

    def _retain_output(self, terminal_id: str, data: bytes) -> TerminalChunk:
        sequence = self._sequences[terminal_id] + 1
        self._sequences[terminal_id] = sequence
        chunk = TerminalChunk(sequence=sequence, data=data)
        chunks = self._chunks[terminal_id]
        chunks.append(chunk)
        size = self._buffer_sizes[terminal_id] + len(data)
        excess = size - self._scrollback_bytes
        while excess > 0:
            oldest = chunks[0]
            if len(oldest.data) <= excess:
                chunks.popleft()
                excess -= len(oldest.data)
            else:
                chunks[0] = TerminalChunk(oldest.sequence, oldest.data[excess:])
                excess = 0
        self._buffer_sizes[terminal_id] = min(size, self._scrollback_bytes)
        return chunk

    async def _publish_state(self, record: TerminalRecord) -> None:
        await self._bus.publish("terminal.state", record.to_dict())
