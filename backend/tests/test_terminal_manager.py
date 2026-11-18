from __future__ import annotations

import asyncio
import base64
import os
from collections.abc import Sequence
from pathlib import Path

import pytest

from cotton.events import Event, EventBus
from cotton.terminals.manager import TerminalManager
from cotton.terminals.models import TerminalChunk, TerminalState
from cotton.terminals.ports import PtySession


class FakePtySession:
    def __init__(self, chunks: Sequence[bytes] = (), exit_code: int = 0) -> None:
        self.pid = 4242
        self._chunks = list(chunks)
        self._exit_code = exit_code

    async def read(self) -> bytes | None:
        await asyncio.sleep(0)
        return self._chunks.pop(0) if self._chunks else None

    async def write(self, data: bytes) -> None:
        pass

    async def resize(self, cols: int, rows: int) -> None:
        pass

    def has_foreground_job(self) -> bool:
        return False

    async def close(self) -> int:
        return self._exit_code


class FakePtySpawner:
    def __init__(self, session: PtySession | None = None, error: OSError | None = None) -> None:
        self.session = session or FakePtySession()
        self.error = error
        self.calls: list[tuple[tuple[str, ...], Path, dict[str, str]]] = []

    async def spawn(self, argv: Sequence[str], cwd: Path, env: dict[str, str]) -> PtySession:
        self.calls.append((tuple(argv), cwd, dict(env)))
        if self.error is not None:
            raise self.error
        return self.session


async def wait_for_exit(manager: TerminalManager, terminal_id: str) -> None:
    for _ in range(100):
        if manager.get(terminal_id).state is TerminalState.EXITED:
            return
        await asyncio.sleep(0.01)
    raise AssertionError("terminal did not exit")


def events_from(queue: asyncio.Queue[Event]) -> list[Event]:
    events: list[Event] = []
    while not queue.empty():
        events.append(queue.get_nowait())
    return events


async def test_default_start_uses_shell_and_inherits_environment(tmp_path: Path) -> None:
    bus = EventBus()
    spawner = FakePtySpawner()
    manager = TerminalManager(bus, spawner)

    record = await manager.start(cwd=tmp_path)

    assert record.spec.kind == "shell"
    assert record.spec.argv == (os.environ.get("SHELL") or "/bin/sh",)
    assert record.spec.cwd == tmp_path
    assert record.spec.env["PATH"] == os.environ["PATH"]
    assert spawner.calls[0][0] == record.spec.argv


async def test_command_start_preserves_argv_and_environment_overrides(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("COTTON_TEST_PARENT", "inherited")
    spawner = FakePtySpawner()
    manager = TerminalManager(EventBus(), spawner)

    record = await manager.start(
        ["python", "-c", "print('hi')"], cwd=tmp_path, env={"COTTON_TEST_CHILD": "set"}
    )

    assert record.spec.kind == "command"
    assert record.spec.argv == ("python", "-c", "print('hi')")
    assert record.spec.env["COTTON_TEST_PARENT"] == "inherited"
    assert record.spec.env["COTTON_TEST_CHILD"] == "set"
    assert spawner.calls[0] == (
        ("python", "-c", "print('hi')"),
        tmp_path,
        dict(record.spec.env),
    )


async def test_start_publishes_lifecycle_and_ordered_output_events() -> None:
    bus = EventBus()
    queue = bus.subscribe()
    spawner = FakePtySpawner(FakePtySession([b"first", b"second"], exit_code=3))
    manager = TerminalManager(bus, spawner)

    record = await manager.start(["command"])
    await wait_for_exit(manager, record.spec.id)

    events = events_from(queue)
    states = [event.data["state"] for event in events if event.type == "terminal.state"]
    outputs = [event for event in events if event.type == "terminal.output"]
    assert states == ["starting", "running", "exited"]
    assert manager.list() == [manager.get(record.spec.id)]
    assert manager.get(record.spec.id).exit_code == 3
    assert [event.data["sequence"] for event in outputs] == [1, 2]
    assert [base64.b64decode(event.data["data"]) for event in outputs] == [b"first", b"second"]
    assert manager.output_since(record.spec.id, 0) == [
        TerminalChunk(1, b"first"),
        TerminalChunk(2, b"second"),
    ]


async def test_spawn_failure_is_retained_and_published() -> None:
    bus = EventBus()
    queue = bus.subscribe()
    manager = TerminalManager(bus, FakePtySpawner(error=FileNotFoundError("not found")))

    record = await manager.start(["missing-terminal"])

    assert record.state is TerminalState.FAILED
    assert record.error is not None
    assert "not found" in record.error
    assert [event.data["state"] for event in events_from(queue)] == ["starting", "failed"]


async def test_output_buffer_does_not_exceed_configured_byte_limit() -> None:
    manager = TerminalManager(
        EventBus(),
        FakePtySpawner(FakePtySession([b"a" * 40000, b"b" * 40000])),
    )

    record = await manager.start(["command"])
    await wait_for_exit(manager, record.spec.id)

    retained = manager.output_since(record.spec.id, 0)
    assert sum(len(chunk.data) for chunk in retained) <= 65536


async def test_output_buffer_keeps_newest_suffix_of_oversized_chunk() -> None:
    output = b"a" * 65536 + b"latest"
    manager = TerminalManager(EventBus(), FakePtySpawner(FakePtySession([output, b"!"])))

    record = await manager.start(["command"])
    await wait_for_exit(manager, record.spec.id)

    retained = manager.output_since(record.spec.id, 0)
    assert [chunk.sequence for chunk in retained] == [1, 2]
    assert sum(len(chunk.data) for chunk in retained) == 65536
    assert b"".join(chunk.data for chunk in retained) == (output + b"!")[-65536:]
    assert manager.output_since(record.spec.id, 2) == []
