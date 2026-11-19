from __future__ import annotations

import asyncio
import base64
import os
from collections.abc import Sequence
from pathlib import Path

import pytest

from cotton.events import Event, EventBus
from cotton.terminals.manager import TerminalBusy, TerminalManager, TerminalNotFound
from cotton.terminals.models import TerminalChunk, TerminalRecord, TerminalState
from cotton.terminals.ports import PtySession

WS = "ws_test"
GRP = "grp_test"


async def start(
    manager: TerminalManager, argv: Sequence[str] | None = None, **kwargs: object
) -> TerminalRecord:
    return await manager.start(argv, workspace_id=WS, group_id=GRP, **kwargs)


class FakePtySession:
    def __init__(
        self,
        chunks: Sequence[bytes] = (),
        exit_code: int = 0,
        wait_for_close: bool = False,
        foreground_job: bool = False,
        foreground_error: bool = False,
    ) -> None:
        self.pid = 4242
        self._chunks = list(chunks)
        self._exit_code = exit_code
        self._wait_for_close = wait_for_close
        self._foreground_job = foreground_job
        self._foreground_error = foreground_error
        self._closed = asyncio.Event()
        self.closed = False
        self.writes: list[bytes] = []
        self.resizes: list[tuple[int, int]] = []

    async def read(self) -> bytes | None:
        await asyncio.sleep(0)
        if self._chunks:
            return self._chunks.pop(0)
        if self._wait_for_close and not self.closed:
            await self._closed.wait()
        return None

    async def write(self, data: bytes) -> None:
        self.writes.append(data)

    async def resize(self, cols: int, rows: int) -> None:
        self.resizes.append((cols, rows))

    def has_foreground_job(self) -> bool:
        if self._foreground_error:
            raise OSError("foreground process group is unavailable")
        return self._foreground_job

    async def close(self) -> int:
        self.closed = True
        self._closed.set()
        return self._exit_code


class PermissionDeniedPtySession(FakePtySession):
    async def close(self) -> int:
        raise PermissionError("operation not permitted")


class FakePtySpawner:
    def __init__(
        self,
        session: PtySession | None = None,
        error: OSError | None = None,
        sessions: Sequence[PtySession] | None = None,
    ) -> None:
        self.sessions = list(sessions) if sessions is not None else [session or FakePtySession()]
        self.error = error
        self.calls: list[tuple[tuple[str, ...], Path, dict[str, str]]] = []

    async def spawn(self, argv: Sequence[str], cwd: Path, env: dict[str, str]) -> PtySession:
        self.calls.append((tuple(argv), cwd, dict(env)))
        if self.error is not None:
            raise self.error
        return self.sessions.pop(0)


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

    record = await start(manager, cwd=tmp_path)

    assert record.spec.kind == "shell"
    assert record.spec.argv == (os.environ.get("SHELL") or "/bin/sh",)
    assert record.spec.cwd == tmp_path
    assert record.spec.env["PATH"] == os.environ["PATH"]
    assert spawner.calls[0][0] == record.spec.argv


async def test_shutdown_continues_after_terminal_close_permission_error(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    spawner = FakePtySpawner(
        sessions=[
            PermissionDeniedPtySession(wait_for_close=True),
            FakePtySession(wait_for_close=True),
        ]
    )
    manager = TerminalManager(EventBus(), spawner)
    failed = await start(manager, ["python", "-c", "pass"], cwd=tmp_path)
    closed = await start(manager, ["python", "-c", "pass"], cwd=tmp_path)

    await manager.shutdown()

    assert manager.get(failed.spec.id).state is TerminalState.FAILED
    assert manager.get(closed.spec.id).state is TerminalState.EXITED
    assert "Failed to close terminal" in caplog.text


async def test_command_start_preserves_argv_and_environment_overrides(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("COTTON_TEST_PARENT", "inherited")
    spawner = FakePtySpawner()
    manager = TerminalManager(EventBus(), spawner)

    record = await start(
        manager, ["python", "-c", "print('hi')"], cwd=tmp_path, env={"COTTON_TEST_CHILD": "set"}
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

    record = await start(manager, ["command"])
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

    record = await start(manager, ["missing-terminal"])

    assert record.state is TerminalState.FAILED
    assert record.error is not None
    assert "not found" in record.error
    assert [event.data["state"] for event in events_from(queue)] == ["starting", "failed"]


async def test_output_buffer_does_not_exceed_configured_byte_limit() -> None:
    manager = TerminalManager(
        EventBus(),
        FakePtySpawner(FakePtySession([b"a" * 40000, b"b" * 40000])),
    )

    record = await start(manager, ["command"])
    await wait_for_exit(manager, record.spec.id)

    retained = manager.output_since(record.spec.id, 0)
    assert sum(len(chunk.data) for chunk in retained) <= 65536


async def test_output_buffer_keeps_newest_suffix_of_oversized_chunk() -> None:
    output = b"a" * 65536 + b"latest"
    manager = TerminalManager(EventBus(), FakePtySpawner(FakePtySession([output, b"!"])))

    record = await start(manager, ["command"])
    await wait_for_exit(manager, record.spec.id)

    retained = manager.output_since(record.spec.id, 0)
    assert [chunk.sequence for chunk in retained] == [1, 2]
    assert sum(len(chunk.data) for chunk in retained) == 65536
    assert b"".join(chunk.data for chunk in retained) == (output + b"!")[-65536:]
    assert manager.output_since(record.spec.id, 2) == []


async def test_input_and_resize_are_forwarded_to_the_pty() -> None:
    session = FakePtySession(wait_for_close=True)
    manager = TerminalManager(EventBus(), FakePtySpawner(session))
    record = await start(manager)

    await manager.write_input(record.spec.id, b"hello")
    await manager.resize(record.spec.id, 81, 25)
    await manager.close(record.spec.id, force=True)

    assert session.writes == [b"hello"]
    assert session.resizes == [(81, 25)]


@pytest.mark.parametrize(("cols", "rows"), [(0, 24), (1001, 24), (80, 0), (80, 1001)])
async def test_resize_rejects_dimensions_outside_supported_range(cols: int, rows: int) -> None:
    session = FakePtySession(wait_for_close=True)
    manager = TerminalManager(EventBus(), FakePtySpawner(session))
    record = await start(manager)

    with pytest.raises(ValueError):
        await manager.resize(record.spec.id, cols, rows)

    await manager.close(record.spec.id, force=True)


async def test_unknown_terminal_ids_are_rejected_for_control_operations() -> None:
    manager = TerminalManager(EventBus(), FakePtySpawner())

    with pytest.raises(TerminalNotFound):
        await manager.write_input("missing", b"x")
    with pytest.raises(TerminalNotFound):
        await manager.resize("missing", 80, 24)
    with pytest.raises(TerminalNotFound):
        manager.has_foreground_job("missing")
    with pytest.raises(TerminalNotFound):
        await manager.close("missing")


async def test_idle_shell_can_close_without_confirmation() -> None:
    session = FakePtySession(wait_for_close=True)
    manager = TerminalManager(EventBus(), FakePtySpawner(session))
    record = await start(manager)

    closed = await manager.close(record.spec.id)

    assert closed.state is TerminalState.EXITED
    assert session.closed


async def test_active_command_requires_force_before_close() -> None:
    session = FakePtySession(wait_for_close=True)
    manager = TerminalManager(EventBus(), FakePtySpawner(session))
    record = await start(manager, ["command"])

    with pytest.raises(TerminalBusy):
        await manager.close(record.spec.id)
    assert not session.closed

    closed = await manager.close(record.spec.id, force=True)

    assert closed.state is TerminalState.EXITED
    assert session.closed


@pytest.mark.parametrize(
    ("foreground_job", "foreground_error"),
    [(True, False), (False, True)],
)
async def test_shell_with_foreground_job_or_unknown_status_requires_force(
    foreground_job: bool, foreground_error: bool
) -> None:
    session = FakePtySession(
        wait_for_close=True,
        foreground_job=foreground_job,
        foreground_error=foreground_error,
    )
    manager = TerminalManager(EventBus(), FakePtySpawner(session))
    record = await start(manager)

    with pytest.raises(TerminalBusy):
        await manager.close(record.spec.id)

    await manager.close(record.spec.id, force=True)


async def test_shutdown_stops_every_live_session() -> None:
    sessions = [
        FakePtySession(wait_for_close=True),
        FakePtySession(wait_for_close=True),
    ]
    manager = TerminalManager(EventBus(), FakePtySpawner(sessions=sessions))
    records = [await start(manager), await start(manager)]

    await manager.shutdown()

    assert all(session.closed for session in sessions)
    assert all(manager.get(record.spec.id).state is TerminalState.EXITED for record in records)


async def test_list_filters_by_workspace_and_assign_moves_the_group() -> None:
    bus = EventBus()
    queue = bus.subscribe()
    sessions = [FakePtySession(wait_for_close=True), FakePtySession(wait_for_close=True)]
    manager = TerminalManager(bus, FakePtySpawner(sessions=sessions))
    first = await manager.start(workspace_id="ws_a", group_id="grp_a")
    second = await manager.start(workspace_id="ws_b", group_id="grp_b")
    events_from(queue)

    assert manager.list("ws_a") == [first]
    assert manager.list() == [first, second]
    assert first.spec.to_dict()["workspace_id"] == "ws_a"
    assert first.spec.to_dict()["group_id"] == "grp_a"

    moved = await manager.assign(first.spec.id, "grp_other")

    assert moved.spec.group_id == "grp_other"
    assert moved.spec.workspace_id == "ws_a"
    assert manager.get(first.spec.id).spec.group_id == "grp_other"
    assert [event.data["spec"]["group_id"] for event in events_from(queue)] == ["grp_other"]
