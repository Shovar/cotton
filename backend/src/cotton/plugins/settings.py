from __future__ import annotations

import json
from typing import Any

from cotton.storage.db import Database


class SettingsRepository:
    """JSON values keyed by name in the ``settings`` table."""

    def __init__(self, db: Database) -> None:
        self._db = db

    def get(self, key: str, default: Any = None) -> Any:
        row = (
            self._db.connection()
            .execute("SELECT value_json FROM settings WHERE key = ?", (key,))
            .fetchone()
        )
        return default if row is None else json.loads(row[0])

    def set(self, key: str, value: Any) -> None:
        connection = self._db.connection()
        connection.execute(
            """
            INSERT INTO settings (key, value_json) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
            """,
            (key, json.dumps(value)),
        )
        connection.commit()
