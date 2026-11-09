from datetime import datetime, timezone
from pathlib import Path

from ros_studio.processes.models import ProcessRecord, ProcessSpec
from ros_studio.storage.db import Database
from ros_studio.storage.process_registry import ProcessRegistry


def record(process_id: str = "p1", pid: int = 123) -> ProcessRecord:
    return ProcessRecord(
        id=process_id,
        spec=ProcessSpec(id=process_id, argv=["sleep", "1"]),
        state="running",
        pid=pid,
        pgid=pid,
        started_at=datetime(2026, 11, 6, 12, 0, 0, tzinfo=timezone.utc),
    )


def test_registry_saves_lists_and_deletes(tmp_path: Path) -> None:
    db = Database(tmp_path / "state.db")
    db.migrate()
    registry = ProcessRegistry(db)

    registry.save(record())

    saved = registry.all()
    assert [item.id for item in saved] == ["p1"]
    assert saved[0].spec == ProcessSpec(id="p1", argv=["sleep", "1"])
    assert saved[0].pid == 123
    assert saved[0].pgid == 123
    assert saved[0].started_at == datetime(2026, 11, 6, 12, 0, 0, tzinfo=timezone.utc)

    registry.delete("p1")

    assert registry.all() == []
    db.close()


def test_registry_upserts_existing_rows(tmp_path: Path) -> None:
    db = Database(tmp_path / "state.db")
    db.migrate()
    registry = ProcessRegistry(db)
    registry.save(record(pid=123))

    registry.save(record(pid=456))

    assert [item.pid for item in registry.all()] == [456]
    db.close()


def test_registry_requires_a_pid(tmp_path: Path) -> None:
    db = Database(tmp_path / "state.db")
    db.migrate()
    registry = ProcessRegistry(db)
    detached = record()
    detached.pid = None

    try:
        registry.save(detached)
    except ValueError as exc:
        assert "pid" in str(exc)
    else:  # pragma: no cover - the assertion above is the point
        raise AssertionError("a record without a pid must not be persisted")
    db.close()
