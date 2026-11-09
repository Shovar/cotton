from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Protocol

from ros_studio.processes.models import ProcessSpec
from ros_studio.storage.db import Database

_ROW = tuple[str, str, str]


@dataclass(frozen=True)
class Profile:
    id: str
    name: str
    processes: list[ProcessSpec]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "processes": [spec.to_dict() for spec in self.processes],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Profile:
        return cls(
            id=str(data["id"]),
            name=str(data.get("name", "")),
            processes=[ProcessSpec.from_dict(item) for item in data.get("processes", [])],
        )


class ProfileStore(Protocol):
    def upsert(self, profile: Profile) -> Profile: ...

    def get(self, profile_id: str) -> Profile | None: ...

    def list(self) -> list[Profile]: ...

    def delete(self, profile_id: str) -> None: ...


class ProfileRepository:
    """Persists named groups of process specs."""

    def __init__(self, db: Database) -> None:
        self._db = db

    def upsert(self, profile: Profile) -> Profile:
        connection = self._db.connection()
        connection.execute(
            """
            INSERT INTO profiles (id, name, processes_json)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                processes_json = excluded.processes_json
            """,
            (profile.id, profile.name, _processes_json(profile)),
        )
        connection.commit()
        return profile

    def get(self, profile_id: str) -> Profile | None:
        row = (
            self._db.connection()
            .execute("SELECT id, name, processes_json FROM profiles WHERE id = ?", (profile_id,))
            .fetchone()
        )
        return None if row is None else _profile_from_row(row)

    def list(self) -> list[Profile]:
        rows = (
            self._db.connection()
            .execute("SELECT id, name, processes_json FROM profiles ORDER BY rowid")
            .fetchall()
        )
        return [_profile_from_row(row) for row in rows]

    def delete(self, profile_id: str) -> None:
        connection = self._db.connection()
        connection.execute("DELETE FROM profiles WHERE id = ?", (profile_id,))
        connection.commit()


def _processes_json(profile: Profile) -> str:
    return json.dumps([spec.to_dict() for spec in profile.processes])


def _profile_from_row(row: _ROW) -> Profile:
    return Profile(
        id=row[0],
        name=row[1],
        processes=[ProcessSpec.from_dict(item) for item in json.loads(row[2])],
    )
