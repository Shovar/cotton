from __future__ import annotations

import re
import shlex
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from cotton.errors import ApiError
from cotton.terminals.manager import TerminalBusy, TerminalManager, TerminalNotFound

_ENV_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class TerminalCreateRequest(BaseModel):
    command: str | list[str] | None = None
    cwd: str | None = None
    env: dict[str, str] = Field(default_factory=dict)


def create_router(manager: TerminalManager) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["terminals"])

    @router.get("/terminals")
    async def list_terminals() -> list[dict[str, Any]]:
        return [record.to_dict() for record in manager.list()]

    @router.post("/terminals", status_code=201)
    async def create_terminal(body: TerminalCreateRequest) -> dict[str, Any]:
        try:
            argv = _command_argv(body.command)
            cwd = _working_directory(body.cwd)
            _validate_environment(body.env)
            record = await manager.start(argv, cwd=cwd, env=body.env)
        except ValueError as exc:
            raise ApiError(422, "validation_error", str(exc)) from exc
        return record.to_dict()

    @router.delete("/terminals/{terminal_id}")
    async def close_terminal(terminal_id: str, force: bool = False) -> dict[str, Any]:
        try:
            record = await manager.close(terminal_id, force=force)
        except TerminalNotFound as exc:
            raise ApiError(404, "terminal_not_found", str(exc)) from exc
        except TerminalBusy as exc:
            raise ApiError(409, "terminal_busy", str(exc)) from exc
        return record.to_dict()

    return router


def _command_argv(command: str | list[str] | None) -> list[str] | None:
    if command is None:
        return None
    if isinstance(command, str):
        if "\x00" in command:
            raise ValueError("command must not contain NUL characters")
        try:
            argv = shlex.split(command)
        except ValueError as exc:
            raise ValueError(f"invalid command string: {exc}") from exc
    else:
        argv = command
    if not argv or not argv[0]:
        raise ValueError("command must contain a non-empty executable")
    if any("\x00" in argument for argument in argv):
        raise ValueError("command arguments must not contain NUL characters")
    return argv


def _working_directory(cwd: str | None) -> Path | None:
    if cwd is None:
        return None
    if "\x00" in cwd:
        raise ValueError("cwd must not contain NUL characters")
    path = Path(cwd)
    if not path.is_dir():
        raise ValueError(f"cwd must be an existing directory: {cwd}")
    return path


def _validate_environment(env: dict[str, str]) -> None:
    for key, value in env.items():
        if not _ENV_KEY.fullmatch(key):
            raise ValueError(f"invalid environment key: {key!r}")
        if "\x00" in value:
            raise ValueError(f"environment value for {key} must not contain NUL characters")
