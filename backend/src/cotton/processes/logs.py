from __future__ import annotations

import json
import re
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

from cotton.processes.models import LogLevel, LogLine, LogStream

_LEVEL = re.compile(r"^\s*\[(DEBUG|INFO|WARN|ERROR)\]")


def parse_level(text: str) -> LogLevel | None:
    match = _LEVEL.match(text)
    return match.group(1).lower() if match else None  # type: ignore[return-value]


class LogBuffer:
    """In-memory circular buffer with the newest ``max_lines`` entries."""

    def __init__(self, process_id: str = "", max_lines: int = 2000) -> None:
        self.process_id = process_id
        self._lines: deque[LogLine] = deque(maxlen=max_lines)

    def append(self, stream: LogStream, text: str, ts: datetime | None = None) -> LogLine:
        line = LogLine(
            id=self.process_id,
            stream=stream,
            level=parse_level(text),
            ts=ts or datetime.now(timezone.utc),
            text=text,
        )
        self._lines.append(line)
        return line

    def tail(self, count: int) -> list[LogLine]:
        if count <= 0:
            return []
        return list(self._lines)[-count:]


class LogFileWriter:
    """Append-only JSON-lines log with size-based rotation."""

    def __init__(self, path: Path, max_bytes: int = 5_000_000, backups: int = 3) -> None:
        self.path = Path(path)
        self.max_bytes = max_bytes
        self.backups = max(1, backups)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def write(self, line: LogLine) -> None:
        payload = json.dumps(line.to_dict(), separators=(",", ":"), ensure_ascii=False) + "\n"
        encoded = payload.encode()
        if self.path.exists() and self.path.stat().st_size + len(encoded) > self.max_bytes:
            self._rotate()
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(payload)

    def _rotate(self) -> None:
        for index in range(self.backups - 1, 0, -1):
            source = self._backup(index)
            if source.exists():
                source.replace(self._backup(index + 1))
        self.path.replace(self._backup(1))

    def _backup(self, index: int) -> Path:
        return self.path.with_name(f"{self.path.name}.{index}")
