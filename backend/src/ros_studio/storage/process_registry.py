from __future__ import annotations

import json
from datetime import datetime

from ros_studio.processes.models import ProcessRecord, ProcessSpec
from ros_studio.storage.db import Database


class ProcessRegistry:
    """Persists running child PIDs so a restarted backend can adopt them."""

    def __init__(self, db: Database) -> None:
        self._db = db

    def save(self, record: ProcessRecord) -> None:
        if record.pid is None or record.pgid is None:
            raise ValueError("cannot persist a process without pid and pgid")
        connection = self._db.connection()
        connection.execute(
            """
            INSERT OR REPLACE INTO process_registry
                (id, spec_json, pid, pgid, started_at, exit_code)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                record.id,
                json.dumps(record.spec.to_dict()),
                record.pid,
                record.pgid,
                record.started_at.isoformat(),
                record.exit_code,
            ),
        )
        connection.commit()

    def delete(self, process_id: str) -> None:
        connection = self._db.connection()
        connection.execute("DELETE FROM process_registry WHERE id = ?", (process_id,))
        connection.commit()

    def all(self) -> list[ProcessRecord]:
        rows = (
            self._db.connection()
            .execute(
                """
            SELECT id, spec_json, pid, pgid, started_at, exit_code
            FROM process_registry
            ORDER BY rowid
            """
            )
            .fetchall()
        )
        return [
            ProcessRecord(
                id=row[0],
                spec=ProcessSpec.from_dict(json.loads(row[1])),
                state="running",
                pid=row[2],
                pgid=row[3],
                started_at=datetime.fromisoformat(row[4]),
                exit_code=row[5],
            )
            for row in rows
        ]
