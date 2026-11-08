from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

_MIGRATIONS = {
    1: """
        CREATE TABLE process_registry (
            id TEXT PRIMARY KEY,
            spec_json TEXT NOT NULL,
            pid INTEGER NOT NULL,
            pgid INTEGER NOT NULL,
            started_at TEXT NOT NULL,
            exit_code INTEGER
        );
    """,
}


class Database:
    """SQLite connection with user_version migrations."""

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._connection: sqlite3.Connection | None = None
        self._lock = threading.Lock()

    def connection(self) -> sqlite3.Connection:
        with self._lock:
            if self._connection is None:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                self._connection = sqlite3.connect(self.path, check_same_thread=False)
                self._connection.execute("PRAGMA journal_mode=WAL")
                self._connection.execute("PRAGMA foreign_keys=ON")
            return self._connection

    def user_version(self) -> int:
        row = self.connection().execute("PRAGMA user_version").fetchone()
        return int(row[0])

    def migrate(self) -> None:
        connection = self.connection()
        current = self.user_version()
        for target in sorted(_MIGRATIONS):
            if target <= current:
                continue
            connection.executescript(_MIGRATIONS[target])
            connection.execute(f"PRAGMA user_version = {target}")

    def close(self) -> None:
        with self._lock:
            if self._connection is not None:
                self._connection.close()
                self._connection = None
