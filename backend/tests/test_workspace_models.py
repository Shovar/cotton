from pathlib import Path

import pytest

from cotton.workspaces.errors import InvalidWorkspace
from cotton.workspaces.models import new_group, new_workspace, utc_now, validate_name


def test_workspace_path_is_canonicalized(tmp_path: Path) -> None:
    workspace = new_workspace("ws", str(tmp_path / "."))
    assert workspace.path == tmp_path.resolve()
    assert workspace.id.startswith("ws_")


def test_workspace_to_dict_serializes_the_path(tmp_path: Path) -> None:
    workspace = new_workspace("ws", str(tmp_path))
    assert workspace.to_dict() == {
        "id": workspace.id,
        "name": "ws",
        "path": str(tmp_path.resolve()),
        "created_at": workspace.created_at,
    }


@pytest.mark.parametrize("path", ["", "/definitely/missing", "bad\x00path"])
def test_invalid_workspace_paths_are_rejected(path: str) -> None:
    with pytest.raises(InvalidWorkspace):
        new_workspace("ws", path)


def test_file_paths_are_rejected(tmp_path: Path) -> None:
    file = tmp_path / "file.txt"
    file.write_text("x")
    with pytest.raises(InvalidWorkspace):
        new_workspace("ws", str(file))


@pytest.mark.parametrize("name", ["", "   ", "a" * 65, "bad\x07name"])
def test_invalid_workspace_names_are_rejected(name: str) -> None:
    with pytest.raises(InvalidWorkspace):
        validate_name(name)


def test_workspace_name_is_stripped() -> None:
    assert validate_name("  ws  ") == "ws"


def test_group_ids_are_prefixed() -> None:
    group = new_group("ws_1", "Default", 0)
    assert group.id.startswith("grp_")
    assert group.to_dict() == {
        "id": group.id,
        "workspace_id": "ws_1",
        "name": "Default",
        "position": 0,
    }


def test_utc_now_uses_the_z_suffix() -> None:
    assert len(utc_now()) == 20
    assert utc_now().endswith("Z")
