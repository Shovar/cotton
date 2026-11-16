from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

ProcessState = Literal["starting", "running", "stopping", "exited", "failed"]
LogLevel = Literal["debug", "info", "warn", "error"]
LogStream = Literal["stdout", "stderr"]


def iso_utc(value: datetime) -> str:
    """Render a timestamp as the contract's ISO 8601 UTC string."""
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class ProcessSpec:
    id: str
    argv: list[str]
    cwd: str | None = None
    env: dict[str, str] = field(default_factory=dict)
    plugin: str | None = None
    autostart: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "argv": list(self.argv),
            "cwd": self.cwd,
            "env": dict(self.env),
            "plugin": self.plugin,
            "autostart": self.autostart,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProcessSpec:
        return cls(
            id=str(data["id"]),
            argv=[str(item) for item in data["argv"]],
            cwd=data.get("cwd"),
            env={str(key): str(value) for key, value in data.get("env", {}).items()},
            plugin=data.get("plugin"),
            autostart=bool(data.get("autostart", False)),
        )


@dataclass
class ProcessRecord:
    id: str
    spec: ProcessSpec
    state: ProcessState
    pid: int | None
    pgid: int | None
    started_at: datetime
    exit_code: int | None = None
    error: str | None = None
    recovered: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "spec": self.spec.to_dict(),
            "state": self.state,
            "pid": self.pid,
            "pgid": self.pgid,
            "started_at": iso_utc(self.started_at),
            "exit_code": self.exit_code,
            "error": self.error,
            "recovered": self.recovered,
        }


@dataclass(frozen=True)
class LogLine:
    id: str
    stream: LogStream
    level: LogLevel | None
    ts: datetime
    text: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "stream": self.stream,
            "level": self.level,
            "ts": iso_utc(self.ts),
            "text": self.text,
        }
