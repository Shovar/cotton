from __future__ import annotations

import asyncio
import base64
import builtins
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


class TerminalNotFound(RuntimeError):
    """No terminal session is known under this id."""


class TerminalManager:
    def __init__(self, bus: EventBus, spawner: PtySpawner, scrollback_bytes: int = 65536) -> None:
        if scrollback_bytes < 1:
            raise ValueError("scrollback_bytes must be positive")
        self._bus = bus
        self._spawner = spawner
        self._scrollback_bytes = scrollback_bytes
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
        cwd: Path | None = None,
        env: Mapping[str, str] | None = None,
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
        self._readers[spec.id] = asyncio.create_task(self._read_output(spec.id, session))
        return record

    def list(self) -> builtins.list[TerminalRecord]:
        return [record for record in self._records.values()]

    def get(self, terminal_id: str) -> TerminalRecord:
        record = self._records.get(terminal_id)
        if record is None:
            raise TerminalNotFound(f"unknown terminal: {terminal_id}")
        return record

    def output_since(self, terminal_id: str, sequence: int) -> builtins.list[TerminalChunk]:
        self.get(terminal_id)
        return [chunk for chunk in self._chunks[terminal_id] if chunk.sequence > sequence]

    async def _read_output(self, terminal_id: str, session: PtySession) -> None:
        try:
            while True:
                data = await session.read()
                if data is None:
                    break
                if not data:
                    continue
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
            return

        record = replace(
            self.get(terminal_id),
            state=TerminalState.EXITED,
            exit_code=exit_code,
        )
        self._records[terminal_id] = record
        await self._publish_state(record)

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
