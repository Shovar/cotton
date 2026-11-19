from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Protocol


class PtySession(Protocol):
    @property
    def pid(self) -> int: ...

    async def read(self) -> bytes | None: ...

    async def write(self, data: bytes) -> None: ...

    async def resize(self, cols: int, rows: int) -> None: ...

    def has_foreground_job(self) -> bool: ...

    async def close(self) -> int: ...


class PtySpawner(Protocol):
    async def spawn(self, argv: Sequence[str], cwd: Path, env: Mapping[str, str]) -> PtySession: ...
