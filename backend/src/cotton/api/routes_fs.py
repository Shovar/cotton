from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter

from cotton.errors import ApiError


def create_router(home: Path | None = None) -> APIRouter:
    """Folder browsing for the workspace picker; it never reads file contents."""
    router = APIRouter(prefix="/api", tags=["filesystem"])
    start = home or Path.home()

    @router.get("/folders")
    async def list_folders(path: str | None = None) -> dict[str, Any]:
        directory = _resolve_directory(path, start)
        return {
            "path": str(directory),
            "parent": None if directory.parent == directory else str(directory.parent),
            "folders": _folders(directory),
        }

    return router


def _resolve_directory(raw: str | None, start: Path) -> Path:
    if not raw:
        return start.resolve()
    if "\x00" in raw:
        raise ApiError(422, "validation_error", "path must not contain NUL characters")
    try:
        directory = Path(raw).expanduser().resolve()
    except (OSError, RuntimeError) as exc:
        raise ApiError(422, "validation_error", f"cannot resolve {raw!r}: {exc}") from exc
    if not directory.is_dir():
        raise ApiError(422, "validation_error", f"not an existing directory: {raw}")
    return directory


def _folders(directory: Path) -> list[dict[str, str]]:
    try:
        entries = [entry for entry in directory.iterdir() if entry.is_dir()]
    except OSError as exc:
        raise ApiError(422, "validation_error", f"cannot list {directory}: {exc}") from exc
    return [
        {"name": entry.name, "path": str(entry)}
        for entry in sorted(entries, key=lambda entry: entry.name.casefold())
    ]
