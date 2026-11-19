from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from types import MappingProxyType
from typing import Any, Literal

TerminalKind = Literal["shell", "command"]


class TerminalState(str, Enum):
    STARTING = "starting"
    RUNNING = "running"
    EXITED = "exited"
    FAILED = "failed"


@dataclass(frozen=True)
class TerminalSpec:
    id: str
    kind: TerminalKind
    argv: tuple[str, ...]
    cwd: Path
    env: Mapping[str, str]
    workspace_id: str
    group_id: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "argv", tuple(self.argv))
        object.__setattr__(self, "env", MappingProxyType(dict(self.env)))

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "argv": list(self.argv),
            "cwd": str(self.cwd),
            "env": dict(sorted(self.env.items())),
            "workspace_id": self.workspace_id,
            "group_id": self.group_id,
        }


@dataclass(frozen=True)
class TerminalRecord:
    spec: TerminalSpec
    state: TerminalState
    pid: int | None
    started_at: str | None
    exit_code: int | None
    error: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "spec": self.spec.to_dict(),
            "state": self.state.value,
            "pid": self.pid,
            "started_at": self.started_at,
            "exit_code": self.exit_code,
            "error": self.error,
        }


@dataclass(frozen=True)
class TerminalChunk:
    sequence: int
    data: bytes
