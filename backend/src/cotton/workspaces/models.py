from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cotton.workspaces.errors import InvalidWorkspace

NAME_MAX_LENGTH = 64


@dataclass(frozen=True)
class Workspace:
    id: str
    name: str
    path: Path
    created_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "path": str(self.path),
            "created_at": self.created_at,
        }


@dataclass(frozen=True)
class TerminalGroup:
    id: str
    workspace_id: str
    name: str
    position: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "workspace_id": self.workspace_id,
            "name": self.name,
            "position": self.position,
        }


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def validate_name(raw: str) -> str:
    name = raw.strip()
    if not 1 <= len(name) <= NAME_MAX_LENGTH:
        raise InvalidWorkspace(f"name must be 1-{NAME_MAX_LENGTH} characters")
    if any(ord(char) < 32 or ord(char) == 127 for char in name):
        raise InvalidWorkspace("name must not contain control characters")
    return name


def validate_path(raw: str) -> Path:
    if not raw or "\x00" in raw:
        raise InvalidWorkspace(f"invalid workspace path: {raw!r}")
    try:
        path = Path(raw).resolve()
    except (OSError, RuntimeError) as exc:
        raise InvalidWorkspace(f"cannot resolve workspace path {raw!r}: {exc}") from exc
    if not path.is_dir():
        raise InvalidWorkspace(f"workspace path is not an existing directory: {raw!r}")
    return path


def new_workspace(name: str, path: str) -> Workspace:
    return Workspace(
        id=f"ws_{uuid.uuid4().hex}",
        name=validate_name(name),
        path=validate_path(path),
        created_at=utc_now(),
    )


def new_group(workspace_id: str, name: str, position: int) -> TerminalGroup:
    return TerminalGroup(
        id=f"grp_{uuid.uuid4().hex}",
        workspace_id=workspace_id,
        name=validate_name(name),
        position=position,
    )
