from __future__ import annotations

from pathlib import Path

from cotton.plugins.settings import SettingsRepository
from cotton.storage.db import Database


def test_migration_creates_settings_table(tmp_path: Path) -> None:
    db = Database(tmp_path / "state.db")
    db.migrate()

    assert db.user_version() == 3
    db.close()


def test_settings_round_trip_json_values(tmp_path: Path) -> None:
    db = Database(tmp_path / "state.db")
    db.migrate()
    settings = SettingsRepository(db)

    assert settings.get("plugins.active", ["fallback"]) == ["fallback"]

    settings.set("plugins.active", ["foxglove"])
    assert settings.get("plugins.active") == ["foxglove"]

    settings.set("plugins.active", [])
    assert settings.get("plugins.active") == []

    db.close()
