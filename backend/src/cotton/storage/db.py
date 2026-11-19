from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

_MIGRATIONS = {
    3: """
        CREATE TABLE settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL
        );
    """,
    4: """
        DROP TABLE IF EXISTS process_registry;
        DROP TABLE IF EXISTS profiles;
    """,
    5: """
        CREATE TABLE workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL
        );
        CREATE TABLE terminal_groups (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            position INTEGER NOT NULL
        );
        CREATE INDEX terminal_groups_by_workspace ON terminal_groups(workspace_id, position);
    """,
    6: """
        CREATE TABLE workspace_commands (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            label TEXT NOT NULL,
            body TEXT NOT NULL,
            is_startup INTEGER NOT NULL DEFAULT 0,
            position INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX workspace_commands_one_startup
            ON workspace_commands(workspace_id) WHERE is_startup = 1;
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
