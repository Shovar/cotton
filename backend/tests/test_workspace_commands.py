from __future__ import annotations

from pathlib import Path

import pytest

from cotton.storage.db import Database
from cotton.workspaces.commands import (
    CommandNotFound,
    InvalidCommand,
    SqliteCommandRepository,
    StartupCommandExists,
    validate_body,
    validate_label,
    validate_startup_body,
)
from cotton.workspaces.repository import SqliteWorkspaceRepository


@pytest.fixture
def database(tmp_path: Path) -> Database:
    db = Database(tmp_path / "cotton.db")
    db.migrate()
    return db


@pytest.fixture
def workspace_id(database: Database, tmp_path: Path) -> str:
    return SqliteWorkspaceRepository(database).create("ws", str(tmp_path)).id


@pytest.fixture
def other_workspace_id(database: Database, tmp_path: Path) -> str:
    other = tmp_path / "other"
    other.mkdir()
    return SqliteWorkspaceRepository(database).create("other", str(other)).id


def test_commands_round_trip_per_workspace(
    database: Database, workspace_id: str, other_workspace_id: str
) -> None:
    commands = SqliteCommandRepository(database)
    created = commands.create(workspace_id, "Build", "colcon build")
    commands.create(other_workspace_id, "Other", "echo other")

    renamed = commands.update(created.id, "Build all", "colcon build --symlink-install", False)
    listed = commands.list(workspace_id)
    commands.delete(created.id)

    assert renamed.label == "Build all"
    assert renamed.body == "colcon build --symlink-install"
    assert [command.label for command in listed] == ["Build all"]
    assert commands.list(workspace_id) == []
    assert [command.label for command in commands.list(other_workspace_id)] == ["Other"]


def test_bodies_are_stored_verbatim_after_strip(database: Database, workspace_id: str) -> None:
    commands = SqliteCommandRepository(database)
    body = "source install/setup.bash && ros2 launch demo demo.launch.py\n"

    command = commands.create(workspace_id, "Launch", f"  {body}  ")

    assert command.body == body.strip()
    assert "&&" in command.body


def test_only_one_startup_command_per_workspace(database: Database, workspace_id: str) -> None:
    commands = SqliteCommandRepository(database)
    commands.create(workspace_id, "Setup", "source /opt/ros/humble/setup.bash", is_startup=True)

    with pytest.raises(StartupCommandExists):
        commands.create(workspace_id, "Another", "echo nope", is_startup=True)

    assert len(commands.list(workspace_id)) == 1


def test_promoting_another_command_moves_the_startup_flag(
    database: Database, workspace_id: str
) -> None:
    commands = SqliteCommandRepository(database)
    first = commands.create(workspace_id, "Setup", "source setup.bash", is_startup=True)
    second = commands.create(workspace_id, "Build", "colcon build")

    commands.update(second.id, second.label, second.body, True)

    startup = commands.startup_for(workspace_id)
    assert startup is not None
    assert startup.id == second.id
    assert commands.get(first.id).is_startup is False


def test_startup_lookup_is_empty_when_unset(database: Database, workspace_id: str) -> None:
    commands = SqliteCommandRepository(database)
    commands.create(workspace_id, "Build", "colcon build")

    assert commands.startup_for(workspace_id) is None


def test_startup_body_must_be_a_single_line(database: Database, workspace_id: str) -> None:
    commands = SqliteCommandRepository(database)

    with pytest.raises(InvalidCommand):
        commands.create(workspace_id, "Setup", "source setup.bash\necho hi", is_startup=True)

    command = commands.create(workspace_id, "Build", "colcon build\necho done")
    assert command.body == "colcon build\necho done"


@pytest.mark.parametrize("raw", ["", "   ", "x" * 4097])
def test_invalid_bodies_are_rejected(raw: str) -> None:
    with pytest.raises(InvalidCommand):
        validate_body(raw)


def test_labels_are_validated() -> None:
    assert validate_label("  Build  ") == "Build"
    with pytest.raises(InvalidCommand):
        validate_label("   ")
    with pytest.raises(InvalidCommand):
        validate_label("bad\x00label")


def test_unknown_command_raises(database: Database) -> None:
    commands = SqliteCommandRepository(database)

    with pytest.raises(CommandNotFound):
        commands.get("cmd_missing")


def test_startup_body_validator_rejects_newlines() -> None:
    assert validate_startup_body("  source setup.bash  ") == "source setup.bash"
    with pytest.raises(InvalidCommand):
        validate_startup_body("echo a\necho b")
