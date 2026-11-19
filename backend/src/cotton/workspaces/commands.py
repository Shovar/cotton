from __future__ import annotations

import builtins
import sqlite3
import uuid
from dataclasses import dataclass
from typing import Any, Protocol

from cotton.storage.db import Database
from cotton.workspaces.errors import WorkspaceError

LABEL_MAX_LENGTH = 64
BODY_MAX_LENGTH = 4096


class CommandNotFound(WorkspaceError):
    """No saved command is known under this id."""


class StartupCommandExists(WorkspaceError):
    """The workspace already has a startup command."""


class InvalidCommand(WorkspaceError):
    """A saved command breaks the domain rules."""


@dataclass(frozen=True)
class WorkspaceCommand:
    id: str
    workspace_id: str
    label: str
    body: str
    is_startup: bool
    position: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "workspace_id": self.workspace_id,
            "label": self.label,
            "body": self.body,
            "is_startup": self.is_startup,
            "position": self.position,
        }


def _validate_text(raw: str, field: str, max_length: int) -> str:
    value = raw.strip()
    if not 1 <= len(value) <= max_length:
        raise InvalidCommand(f"{field} must be 1-{max_length} characters")
    if "\x00" in value:
        raise InvalidCommand(f"{field} must not contain NUL")
    return value


def validate_label(raw: str) -> str:
    return _validate_text(raw, "label", LABEL_MAX_LENGTH)


def validate_body(raw: str) -> str:
    return _validate_text(raw, "body", BODY_MAX_LENGTH)


def validate_startup_body(raw: str) -> str:
    body = validate_body(raw)
    if "\n" in body or "\r" in body:
        raise InvalidCommand("the startup command must be a single line")
    return body


class CommandRepository(Protocol):
    def list(self, workspace_id: str) -> builtins.list[WorkspaceCommand]: ...

    def get(self, command_id: str) -> WorkspaceCommand: ...

    def create(
        self, workspace_id: str, label: str, body: str, is_startup: bool = False
    ) -> WorkspaceCommand: ...

    def update(
        self, command_id: str, label: str, body: str, is_startup: bool
    ) -> WorkspaceCommand: ...

    def delete(self, command_id: str) -> None: ...

    def startup_for(self, workspace_id: str) -> WorkspaceCommand | None: ...


class SqliteCommandRepository:
    """Saved workspace commands in SQLite.

    Bodies are stored verbatim: they are PTY input, never parsed as shell words.
    """

    def __init__(self, db: Database) -> None:
        self._db = db

    def list(self, workspace_id: str) -> builtins.list[WorkspaceCommand]:
        rows = (
            self._db.connection()
            .execute(
                "SELECT id, workspace_id, label, body, is_startup, position"
                " FROM workspace_commands WHERE workspace_id = ? ORDER BY position, label",
                (workspace_id,),
            )
            .fetchall()
        )
        return [_command(row) for row in rows]

    def get(self, command_id: str) -> WorkspaceCommand:
        row = (
            self._db.connection()
            .execute(
                "SELECT id, workspace_id, label, body, is_startup, position"
                " FROM workspace_commands WHERE id = ?",
                (command_id,),
            )
            .fetchone()
        )
        if row is None:
            raise CommandNotFound(f"unknown workspace command: {command_id}")
        return _command(row)

    def create(
        self, workspace_id: str, label: str, body: str, is_startup: bool = False
    ) -> WorkspaceCommand:
        label_value = validate_label(label)
        body_value = validate_startup_body(body) if is_startup else validate_body(body)
        connection = self._db.connection()
        with connection:
            if is_startup and self._startup_row(connection, workspace_id) is not None:
                raise StartupCommandExists(
                    f"workspace {workspace_id} already has a startup command"
                )
            row = connection.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM workspace_commands"
                " WHERE workspace_id = ?",
                (workspace_id,),
            ).fetchone()
            command = WorkspaceCommand(
                id=f"cmd_{uuid.uuid4().hex}",
                workspace_id=workspace_id,
                label=label_value,
                body=body_value,
                is_startup=is_startup,
                position=int(row[0]),
            )
            connection.execute(
                "INSERT INTO workspace_commands"
                " (id, workspace_id, label, body, is_startup, position)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (
                    command.id,
                    command.workspace_id,
                    command.label,
                    command.body,
                    int(command.is_startup),
                    command.position,
                ),
            )
        return command

    def update(self, command_id: str, label: str, body: str, is_startup: bool) -> WorkspaceCommand:
        existing = self.get(command_id)
        label_value = validate_label(label)
        body_value = validate_startup_body(body) if is_startup else validate_body(body)
        connection = self._db.connection()
        with connection:
            if is_startup:
                connection.execute(
                    "UPDATE workspace_commands SET is_startup = 0"
                    " WHERE workspace_id = ? AND is_startup = 1 AND id != ?",
                    (existing.workspace_id, command_id),
                )
            connection.execute(
                "UPDATE workspace_commands SET label = ?, body = ?, is_startup = ? WHERE id = ?",
                (label_value, body_value, int(is_startup), command_id),
            )
        return self.get(command_id)

    def delete(self, command_id: str) -> None:
        connection = self._db.connection()
        cursor = connection.execute("DELETE FROM workspace_commands WHERE id = ?", (command_id,))
        connection.commit()
        if cursor.rowcount == 0:
            raise CommandNotFound(f"unknown workspace command: {command_id}")

    def startup_for(self, workspace_id: str) -> WorkspaceCommand | None:
        row = self._startup_row(self._db.connection(), workspace_id)
        return None if row is None else _command(row)

    @staticmethod
    def _startup_row(
        connection: sqlite3.Connection, workspace_id: str
    ) -> sqlite3.Row | tuple[object, ...] | None:
        return connection.execute(
            "SELECT id, workspace_id, label, body, is_startup, position"
            " FROM workspace_commands WHERE workspace_id = ? AND is_startup = 1",
            (workspace_id,),
        ).fetchone()


def _command(row: sqlite3.Row | tuple[object, ...]) -> WorkspaceCommand:
    return WorkspaceCommand(
        id=str(row[0]),
        workspace_id=str(row[1]),
        label=str(row[2]),
        body=str(row[3]),
        is_startup=bool(row[4]),
        position=int(str(row[5])),
    )
