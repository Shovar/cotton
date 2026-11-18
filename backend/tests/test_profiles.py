from __future__ import annotations

from pathlib import Path

from cotton.processes.models import ProcessSpec
from cotton.processes.profiles import Profile, ProfileRepository
from cotton.storage.db import Database


def repository(tmp_path: Path) -> ProfileRepository:
    db = Database(tmp_path / "state.db")
    db.migrate()
    return ProfileRepository(db)


def test_upsert_get_list_and_delete(tmp_path: Path) -> None:
    store = repository(tmp_path)
    store.upsert(
        Profile(
            id="sim",
            name="Simulation",
            processes=[ProcessSpec(id="a", argv=["sleep", "1"])],
        )
    )

    updated = Profile(id="sim", name="Simulation v2", processes=[])
    store.upsert(updated)

    assert store.get("sim") == updated
    assert store.list() == [updated]

    store.delete("sim")

    assert store.get("sim") is None
    assert store.list() == []


def test_profiles_are_isolated_per_database(tmp_path: Path) -> None:
    store = repository(tmp_path)
    store.upsert(Profile(id="sim", name="Sim", processes=[]))

    other = repository(tmp_path / "other")

    assert other.list() == []
