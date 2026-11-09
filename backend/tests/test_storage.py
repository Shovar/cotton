from pathlib import Path

from ros_studio.storage.db import Database


def tables(db: Database) -> set[str]:
    rows = db.connection().execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    return {row[0] for row in rows}


def test_migrates_to_version_two_with_registry_and_profiles(tmp_path: Path) -> None:
    db = Database(tmp_path / "state.db")

    db.migrate()

    assert db.user_version() == 2
    assert {"process_registry", "profiles"} <= tables(db)
    assert db.connection().execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    db.close()


def test_migrate_is_idempotent_and_creates_parent_directory(tmp_path: Path) -> None:
    db = Database(tmp_path / "nested" / "state.db")

    db.migrate()
    db.migrate()

    assert db.user_version() == 2
    assert (tmp_path / "nested").is_dir()
    db.close()


def test_close_is_idempotent_and_reopening_keeps_version(tmp_path: Path) -> None:
    path = tmp_path / "state.db"
    db = Database(path)
    db.migrate()
    db.close()
    db.close()

    reopened = Database(path)
    assert reopened.user_version() == 2
    reopened.close()
