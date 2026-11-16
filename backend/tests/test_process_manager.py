from __future__ import annotations

import asyncio
import os
import sys
from collections.abc import AsyncIterator
from pathlib import Path

import pytest

from cotton.events import Event, EventBus
from cotton.processes.manager import (
    ProcessConflict,
    ProcessManager,
    ProcessNotFound,
    StopTimeouts,
)
from cotton.processes.models import ProcessSpec


@pytest.fixture
async def manager(tmp_path: Path, bus: EventBus) -> AsyncIterator[ProcessManager]:
    instance = ProcessManager(
        bus=bus,
        logs_dir=tmp_path / "logs",
        stop_timeouts=StopTimeouts(interrupt=0.2, terminate=0.2),
    )
    yield instance
    await instance.shutdown()


def process_alive(pid: int | None) -> bool:
    if pid is None:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def group_alive(pgid: int | None) -> bool:
    if pgid is None:
        return False
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


async def eventually(predicate, timeout: float = 3.0) -> None:
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        if predicate():
            return
        await asyncio.sleep(0.02)
    raise AssertionError("condition did not become true")


def python_script(source: str) -> list[str]:
    return [sys.executable, "-c", source]


async def test_start_streams_logs_and_stops(manager: ProcessManager, tmp_path: Path) -> None:
    record = await manager.start(
        ProcessSpec(
            id="p1", argv=python_script("print('hola', flush=True); import time; time.sleep(30)")
        )
    )

    assert record.state == "running"
    assert record.pid == record.pgid
    await eventually(lambda: any(line.text == "hola" for line in manager.logs("p1").tail(10)))
    line = next(line for line in manager.logs("p1").tail(10) if line.text == "hola")
    assert line.id == "p1"
    assert line.stream == "stdout"
    assert line.ts.tzinfo is not None
    assert (tmp_path / "logs" / "p1.log").exists()

    stopped = await manager.stop("p1")

    assert stopped.state == "exited"
    assert not process_alive(record.pid)
    assert not group_alive(record.pgid)


async def test_unknown_command_is_failed_with_error(manager: ProcessManager) -> None:
    record = await manager.start(ProcessSpec(id="p2", argv=["/definitely/not/a/command"]))

    assert record.state == "failed"
    assert record.error is not None
    assert "not found" in record.error
    assert manager.get("p2").state == "failed"


async def test_nonzero_exit_is_failed_with_code(manager: ProcessManager) -> None:
    await manager.start(ProcessSpec(id="p3", argv=python_script("import sys; sys.exit(3)")))

    await eventually(lambda: manager.get("p3").state == "failed")
    assert manager.get("p3").exit_code == 3


async def test_duplicate_active_id_conflicts(manager: ProcessManager) -> None:
    await manager.start(ProcessSpec(id="p4", argv=python_script("import time; time.sleep(30)")))

    with pytest.raises(ProcessConflict):
        await manager.start(ProcessSpec(id="p4", argv=python_script("pass")))


async def test_stop_escalates_when_child_ignores_interrupt_and_terminate(
    manager: ProcessManager,
) -> None:
    record = await manager.start(
        ProcessSpec(
            id="p5",
            argv=["/bin/sh", "-c", "trap '' INT TERM; sleep 30"],
        )
    )

    stopped = await asyncio.wait_for(manager.stop("p5"), timeout=3.0)

    assert stopped.state == "exited"
    await eventually(lambda: not process_alive(record.pid))
    assert not group_alive(record.pgid)


async def test_shutdown_stops_every_process_in_reverse_order(manager: ProcessManager) -> None:
    first = await manager.start(
        ProcessSpec(id="a", argv=python_script("import time; time.sleep(30)"))
    )
    second = await manager.start(
        ProcessSpec(id="b", argv=python_script("import time; time.sleep(30)"))
    )

    await manager.shutdown()
    await manager.shutdown()

    assert manager.get("a").state == "exited"
    assert manager.get("b").state == "exited"
    await eventually(lambda: not process_alive(first.pid) and not process_alive(second.pid))


async def test_restart_uses_same_spec_and_new_pid(manager: ProcessManager) -> None:
    first = await manager.start(
        ProcessSpec(id="r", argv=python_script("import time; time.sleep(30)"))
    )

    second = await manager.restart("r")

    assert second.id == "r"
    assert second.spec == first.spec
    assert second.state == "running"
    assert second.pid != first.pid
    await eventually(lambda: not process_alive(first.pid))


async def test_missing_process_raises(manager: ProcessManager) -> None:
    with pytest.raises(ProcessNotFound):
        manager.get("missing")
    with pytest.raises(ProcessNotFound):
        manager.logs("missing")
    with pytest.raises(ProcessNotFound):
        await manager.stop("missing")
    with pytest.raises(ProcessNotFound):
        await manager.restart("missing")
    with pytest.raises(ProcessNotFound):
        await manager.close("missing")


async def test_close_stops_forgets_and_announces(
    manager: ProcessManager, bus: EventBus
) -> None:
    queue = bus.subscribe()
    try:
        record = await manager.start(
            ProcessSpec(id="gone", argv=python_script("import time; time.sleep(30)"))
        )

        closed = await manager.close("gone")

        assert closed.state == "exited"
        assert not process_alive(record.pid)
        assert not group_alive(record.pgid)
        assert manager.list() == []
        with pytest.raises(ProcessNotFound):
            manager.logs("gone")

        await asyncio.sleep(0.05)
        events = []
        while not queue.empty():
            events.append(queue.get_nowait())
        assert Event("process.removed", {"id": "gone"}) in events
    finally:
        bus.unsubscribe(queue)


async def test_close_forgets_an_already_exited_process(manager: ProcessManager) -> None:
    await manager.start(ProcessSpec(id="done", argv=python_script("pass")))
    await eventually(lambda: manager.get("done").state == "exited")

    closed = await manager.close("done")

    assert closed.state == "exited"
    assert manager.list() == []


async def test_stop_keeps_the_record_and_does_not_announce_removal(
    manager: ProcessManager, bus: EventBus
) -> None:
    queue = bus.subscribe()
    try:
        await manager.start(
            ProcessSpec(id="kept", argv=python_script("import time; time.sleep(30)"))
        )
        await manager.stop("kept")
        await asyncio.sleep(0.05)

        events = []
        while not queue.empty():
            events.append(queue.get_nowait())
        assert [record.id for record in manager.list()] == ["kept"]
        assert all(event.type != "process.removed" for event in events)
    finally:
        bus.unsubscribe(queue)


async def test_publishes_state_and_log_events(manager: ProcessManager, bus: EventBus) -> None:
    queue = bus.subscribe()
    try:
        await manager.start(ProcessSpec(id="e", argv=python_script("print('event', flush=True)")))
        await eventually(lambda: manager.get("e").state == "exited")
        await asyncio.sleep(0.05)

        events = []
        while not queue.empty():
            events.append(queue.get_nowait())
        types = [event.type for event in events]
        states = [event.data["state"] for event in events if event.type == "process.state"]
        assert "process.log" in types
        assert states[0] == "starting"
        assert states[-1] == "exited"
        assert any(event.data["text"] == "event" for event in events if event.type == "process.log")
    finally:
        bus.unsubscribe(queue)
