from __future__ import annotations

import builtins
import os
import sqlite3
from pathlib import Path
from typing import Protocol

from cotton.storage.db import Database
from cotton.workspaces.errors import (
    GroupNotFound,
    WorkspaceExists,
    WorkspaceNotFound,
)
from cotton.workspaces.models import (
    TerminalGroup,
    Workspace,
    new_group,
    new_workspace,
    validate_name,
)

DEFAULT_GROUP_NAME = "Default"


class WorkspaceRepository(Protocol):
    def list(self) -> builtins.list[Workspace]: ...

    def get(self, workspace_id: str) -> Workspace: ...

    def create(self, name: str, path: str) -> Workspace: ...

    def rename(self, workspace_id: str, name: str) -> Workspace: ...

    def delete(self, workspace_id: str) -> None: ...

    def list_groups(self, workspace_id: str) -> builtins.list[TerminalGroup]: ...

    def get_group(self, group_id: str) -> TerminalGroup: ...

    def create_group(self, workspace_id: str, name: str) -> TerminalGroup: ...

    def rename_group(self, group_id: str, name: str) -> TerminalGroup: ...

    def delete_group(self, group_id: str) -> None: ...


class SqliteWorkspaceRepository:
    """Workspaces and their terminal groups in SQLite."""

    def __init__(self, db: Database) -> None:
        self._db = db

    def list(self) -> builtins.list[Workspace]:
        rows = (
            self._db.connection()
            .execute("SELECT id, name, path, created_at FROM workspaces ORDER BY name")
            .fetchall()
        )
        return [_workspace(row) for row in rows]

    def get(self, workspace_id: str) -> Workspace:
        row = (
            self._db.connection()
            .execute(
                "SELECT id, name, path, created_at FROM workspaces WHERE id = ?",
                (workspace_id,),
            )
            .fetchone()
        )
        if row is None:
            raise WorkspaceNotFound(f"unknown workspace: {workspace_id}")
        return _workspace(row)

    def create(self, name: str, path: str) -> Workspace:
        workspace = new_workspace(name, path)
        connection = self._db.connection()
        with connection:
            if self._path_taken(connection, workspace):
                raise WorkspaceExists(f"workspace path already registered: {workspace.path}")
            connection.execute(
                "INSERT INTO workspaces (id, name, path, created_at) VALUES (?, ?, ?, ?)",
                (workspace.id, workspace.name, str(workspace.path), workspace.created_at),
            )
            group = new_group(workspace.id, DEFAULT_GROUP_NAME, 0)
            connection.execute(
                "INSERT INTO terminal_groups (id, workspace_id, name, position)"
                " VALUES (?, ?, ?, ?)",
                (group.id, group.workspace_id, group.name, group.position),
            )
        return workspace

    def rename(self, workspace_id: str, name: str) -> Workspace:
        connection = self._db.connection()
        cursor = connection.execute(
            "UPDATE workspaces SET name = ? WHERE id = ?", (validate_name(name), workspace_id)
        )
        connection.commit()
        if cursor.rowcount == 0:
            raise WorkspaceNotFound(f"unknown workspace: {workspace_id}")
        return self.get(workspace_id)

    def delete(self, workspace_id: str) -> None:
        connection = self._db.connection()
        cursor = connection.execute("DELETE FROM workspaces WHERE id = ?", (workspace_id,))
        connection.commit()
        if cursor.rowcount == 0:
            raise WorkspaceNotFound(f"unknown workspace: {workspace_id}")

    def list_groups(self, workspace_id: str) -> builtins.list[TerminalGroup]:
        rows = (
            self._db.connection()
            .execute(
                "SELECT id, workspace_id, name, position FROM terminal_groups"
                " WHERE workspace_id = ? ORDER BY position, name",
                (workspace_id,),
            )
            .fetchall()
        )
        return [_group(row) for row in rows]

    def get_group(self, group_id: str) -> TerminalGroup:
        row = (
            self._db.connection()
            .execute(
                "SELECT id, workspace_id, name, position FROM terminal_groups WHERE id = ?",
                (group_id,),
            )
            .fetchone()
        )
        if row is None:
            raise GroupNotFound(f"unknown terminal group: {group_id}")
        return _group(row)

    def create_group(self, workspace_id: str, name: str) -> TerminalGroup:
        self.get(workspace_id)
        connection = self._db.connection()
        row = connection.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM terminal_groups WHERE workspace_id = ?",
            (workspace_id,),
        ).fetchone()
        group = new_group(workspace_id, name, int(row[0]))
        connection.execute(
            "INSERT INTO terminal_groups (id, workspace_id, name, position) VALUES (?, ?, ?, ?)",
            (group.id, group.workspace_id, group.name, group.position),
        )
        connection.commit()
        return group

    def rename_group(self, group_id: str, name: str) -> TerminalGroup:
        connection = self._db.connection()
        cursor = connection.execute(
            "UPDATE terminal_groups SET name = ? WHERE id = ?", (validate_name(name), group_id)
        )
        connection.commit()
        if cursor.rowcount == 0:
            raise GroupNotFound(f"unknown terminal group: {group_id}")
        return self.get_group(group_id)

    def delete_group(self, group_id: str) -> None:
        connection = self._db.connection()
        cursor = connection.execute("DELETE FROM terminal_groups WHERE id = ?", (group_id,))
        connection.commit()
        if cursor.rowcount == 0:
            raise GroupNotFound(f"unknown terminal group: {group_id}")

    @staticmethod
    def _path_taken(connection: sqlite3.Connection, workspace: Workspace) -> bool:
        candidate = os.path.normcase(str(workspace.path))
        rows = connection.execute("SELECT path FROM workspaces").fetchall()
        return any(os.path.normcase(row[0]) == candidate for row in rows)


def _workspace(row: sqlite3.Row | tuple[object, ...]) -> Workspace:
    return Workspace(
        id=str(row[0]),
        name=str(row[1]),
        path=Path(str(row[2])),
        created_at=str(row[3]),
    )


def _group(row: sqlite3.Row | tuple[object, ...]) -> TerminalGroup:
    return TerminalGroup(
        id=str(row[0]),
        workspace_id=str(row[1]),
        name=str(row[2]),
        position=int(str(row[3])),
    )
