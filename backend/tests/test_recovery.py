from __future__ import annotations

import asyncio
import os
import sys
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from cotton.app import create_app
from cotton.events import EventBus
from cotton.processes.manager import ProcessManager, StopTimeouts
from cotton.processes.models import ProcessRecord, ProcessSpec
from cotton.storage.db import Database
from cotton.storage.process_registry import ProcessRegistry


@pytest.fixture
async def manager(tmp_path: Path, bus: EventBus) -> AsyncIterator[ProcessManager]:
    instance = ProcessManager(
        bus=bus,
        logs_dir=tmp_path / "logs",
        stop_timeouts=StopTimeouts(interrupt=0.2, terminate=0.2),
    )
    yield instance
    await instance.shutdown()


@pytest.fixture
def registry(tmp_path: Path) -> ProcessRegistry:
    db = Database(tmp_path / "state.db")
    db.migrate()
    return ProcessRegistry(db)


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


def dead_record(pid: int) -> ProcessRecord:
    return ProcessRecord(
        id="dead",
        spec=ProcessSpec(id="dead", argv=["sleep", "1"]),
        state="running",
        pid=pid,
        pgid=pid,
        started_at=datetime(2026, 11, 6, 12, 0, 0, tzinfo=timezone.utc),
    )


async def test_recover_alive_orphan_and_stop_it(
    manager: ProcessManager, registry: ProcessRegistry, tmp_path: Path, bus: EventBus
) -> None:
    record = await manager.start(
        ProcessSpec(
            id="orphan",
            argv=[sys.executable, "-c", "import time; time.sleep(30)"],
        )
    )
    registry.save(record)
    recovered_manager = ProcessManager(
        bus=bus,
        logs_dir=tmp_path / "logs",
        registry=registry,
        stop_timeouts=StopTimeouts(interrupt=0.2, terminate=0.2),
    )

    recovered = await recovered_manager.recover()

    assert [item.id for item in recovered] == ["orphan"]
    assert recovered[0].state == "running"
    assert recovered[0].recovered is True
    assert recovered_manager.logs("orphan").tail(10) == []
    await recovered_manager.shutdown()
    await asyncio.sleep(0.05)
    assert not process_alive(record.pid)
    assert registry.all() == []


async def test_recover_dead_pid_is_deleted(
    registry: ProcessRegistry, tmp_path: Path, bus: EventBus
) -> None:
    registry.save(dead_record(pid=999_999))
    recovered_manager = ProcessManager(bus=bus, logs_dir=tmp_path / "logs", registry=registry)

    recovered = await recovered_manager.recover()

    assert recovered == []
    assert recovered_manager.list() == []
    assert registry.all() == []


def test_app_shutdown_hook_stops_children(services, tmp_path: Path) -> None:
    manager = ProcessManager(
        bus=services.bus,
        logs_dir=tmp_path / "logs",
        stop_timeouts=StopTimeouts(interrupt=0.2, terminate=0.2),
    )
    services.startup.append(manager.recover)
    services.shutdown.append(manager.shutdown)

    with TestClient(create_app(services)) as client:
        record = client.portal.call(
            manager.start,
            ProcessSpec(
                id="life",
                argv=[sys.executable, "-c", "import time; time.sleep(30)"],
            ),
        )
        assert process_alive(record.pid)

    assert manager.get("life").state == "exited"
    assert not process_alive(record.pid)
