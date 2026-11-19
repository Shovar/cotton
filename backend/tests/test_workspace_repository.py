from pathlib import Path

import pytest

from cotton.storage.db import Database
from cotton.workspaces.errors import (
    GroupNotFound,
    InvalidWorkspace,
    WorkspaceExists,
    WorkspaceNotFound,
)
from cotton.workspaces.repository import SqliteWorkspaceRepository


@pytest.fixture
def db(tmp_path: Path) -> Database:
    database = Database(tmp_path / "state.db")
    database.migrate()
    yield database
    database.close()


@pytest.fixture
def repository(db: Database) -> SqliteWorkspaceRepository:
    return SqliteWorkspaceRepository(db)


def test_create_adds_a_default_group(tmp_path: Path, repository: SqliteWorkspaceRepository) -> None:
    workspace = repository.create("ws", str(tmp_path))

    groups = repository.list_groups(workspace.id)

    assert [group.name for group in groups] == ["Default"]
    assert groups[0].position == 0


def test_duplicate_canonical_path_is_rejected(
    tmp_path: Path, repository: SqliteWorkspaceRepository
) -> None:
    repository.create("ws", str(tmp_path))

    with pytest.raises(WorkspaceExists):
        repository.create("other", str(tmp_path / ".." / tmp_path.name))

    assert len(repository.list()) == 1


def test_invalid_path_creates_nothing(
    tmp_path: Path, db: Database, repository: SqliteWorkspaceRepository
) -> None:
    with pytest.raises(InvalidWorkspace):
        repository.create("ws", str(tmp_path / "missing"))

    assert repository.list() == []
    rows = db.connection().execute("SELECT COUNT(*) FROM terminal_groups").fetchone()
    assert rows[0] == 0


def test_rename_changes_the_name(tmp_path: Path, repository: SqliteWorkspaceRepository) -> None:
    workspace = repository.create("ws", str(tmp_path))

    renamed = repository.rename(workspace.id, "  renamed  ")

    assert renamed.name == "renamed"
    assert repository.get(workspace.id).name == "renamed"


def test_delete_removes_the_workspace_and_its_groups(
    tmp_path: Path, repository: SqliteWorkspaceRepository
) -> None:
    workspace = repository.create("ws", str(tmp_path))
    group_id = repository.list_groups(workspace.id)[0].id

    repository.delete(workspace.id)

    assert repository.list() == []
    with pytest.raises(GroupNotFound):
        repository.get_group(group_id)


def test_unknown_workspace_raises(tmp_path: Path, repository: SqliteWorkspaceRepository) -> None:
    with pytest.raises(WorkspaceNotFound):
        repository.get("ws_missing")
    with pytest.raises(WorkspaceNotFound):
        repository.rename("ws_missing", "name")
    with pytest.raises(WorkspaceNotFound):
        repository.delete("ws_missing")
    with pytest.raises(WorkspaceNotFound):
        repository.create_group("ws_missing", "Group")


def test_groups_append_at_the_end_and_are_ordered(
    tmp_path: Path, repository: SqliteWorkspaceRepository
) -> None:
    workspace = repository.create("ws", str(tmp_path))

    second = repository.create_group(workspace.id, "Second")
    third = repository.create_group(workspace.id, "Third")

    assert (second.position, third.position) == (1, 2)
    assert [group.name for group in repository.list_groups(workspace.id)] == [
        "Default",
        "Second",
        "Third",
    ]


def test_group_rename_and_delete(tmp_path: Path, repository: SqliteWorkspaceRepository) -> None:
    workspace = repository.create("ws", str(tmp_path))
    group = repository.create_group(workspace.id, "Group")

    renamed = repository.rename_group(group.id, "Renamed")
    repository.delete_group(group.id)

    assert renamed.name == "Renamed"
    assert renamed.workspace_id == workspace.id
    with pytest.raises(GroupNotFound):
        repository.get_group(group.id)
    with pytest.raises(GroupNotFound):
        repository.rename_group(group.id, "x")
