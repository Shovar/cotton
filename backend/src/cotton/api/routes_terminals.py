from __future__ import annotations

import re
import shlex
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from cotton.channels import Channel, ChannelRegistry
from cotton.errors import ApiError
from cotton.events import Event
from cotton.terminals.manager import (
    TerminalBusy,
    TerminalCloseFailed,
    TerminalManager,
    TerminalNotFound,
)
from cotton.terminals.shell_input import compose_initial_input
from cotton.workspaces.commands import CommandRepository
from cotton.workspaces.errors import GroupNotFound, WorkspaceNotFound
from cotton.workspaces.models import Workspace
from cotton.workspaces.repository import WorkspaceRepository

_ENV_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class TerminalCreateRequest(BaseModel):
    workspace_id: str | None = None
    group_id: str | None = None
    command: str | list[str] | None = None
    cwd: str | None = None
    env: dict[str, str] = Field(default_factory=dict)


class TerminalGroupRequest(BaseModel):
    group_id: str


def create_router(
    manager: TerminalManager,
    workspaces: WorkspaceRepository,
    commands: CommandRepository | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["terminals"])

    @router.get("/terminals")
    async def list_terminals(workspace_id: str | None = None) -> list[dict[str, Any]]:
        return [record.to_dict() for record in manager.list(workspace_id)]

    @router.post("/terminals", status_code=201)
    async def create_terminal(body: TerminalCreateRequest) -> dict[str, Any]:
        try:
            if body.workspace_id is None:
                raise ApiError(422, "workspace_required", "workspace_id is required")
            workspace = _workspace(workspaces, body.workspace_id)
            group_id = _group_id(workspaces, workspace.id, body.group_id)
            argv = _command_argv(body.command)
            cwd = _working_directory(body.cwd) or workspace.path
            _validate_environment(body.env)
            startup = commands.startup_for(workspace.id) if commands and argv is None else None
            record = await manager.start(
                argv,
                workspace_id=workspace.id,
                group_id=group_id,
                cwd=cwd,
                env=body.env,
                initial_input=compose_initial_input(startup.body if startup else None, None),
            )
        except ValueError as exc:
            raise ApiError(422, "validation_error", str(exc)) from exc
        return record.to_dict()

    @router.patch("/terminals/{terminal_id}")
    async def move_terminal(terminal_id: str, body: TerminalGroupRequest) -> dict[str, Any]:
        try:
            record = manager.get(terminal_id)
        except TerminalNotFound as exc:
            raise ApiError(404, "terminal_not_found", str(exc)) from exc
        group = _group_id(workspaces, record.spec.workspace_id, body.group_id)
        return (await manager.assign(terminal_id, group)).to_dict()

    @router.delete("/terminals/{terminal_id}")
    async def close_terminal(terminal_id: str, force: bool = False) -> dict[str, Any]:
        try:
            record = await manager.close(terminal_id, force=force)
        except TerminalNotFound as exc:
            raise ApiError(404, "terminal_not_found", str(exc)) from exc
        except TerminalBusy as exc:
            raise ApiError(409, "terminal_busy", str(exc)) from exc
        except TerminalCloseFailed as exc:
            raise ApiError(409, "terminal_close_failed", str(exc)) from exc
        await manager.discard(terminal_id)
        return record.to_dict()

    return router


def register_terminal_channels(registry: ChannelRegistry, manager: TerminalManager) -> None:
    async def initial() -> list[Event]:
        return [Event("terminal.state", record.to_dict()) for record in manager.list()]

    registry.register(
        Channel(
            "terminals",
            matches=lambda event: event.type in {"terminal.state", "terminal.removed"},
            initial=initial,
        )
    )
    registry.register_family("terminal:", lambda name: _terminal_channel(manager, name))


def _terminal_channel(manager: TerminalManager, name: str) -> Channel | None:
    terminal_id = name.removeprefix("terminal:")
    try:
        manager.get(terminal_id)
    except TerminalNotFound:
        return None

    return Channel(
        name,
        matches=lambda event: (
            event.type in {"terminal.output", "terminal.state", "terminal.removed"}
            and event.data.get("id") == terminal_id
        ),
    )


def _workspace(workspaces: WorkspaceRepository, workspace_id: str) -> Workspace:
    try:
        return workspaces.get(workspace_id)
    except WorkspaceNotFound as exc:
        raise ApiError(404, "workspace_not_found", str(exc)) from exc


def _group_id(workspaces: WorkspaceRepository, workspace_id: str, group_id: str | None) -> str:
    groups = workspaces.list_groups(workspace_id)
    if group_id is None:
        return groups[0].id
    try:
        group = workspaces.get_group(group_id)
    except GroupNotFound as exc:
        raise ApiError(422, "group_not_found", str(exc)) from exc
    if group.workspace_id != workspace_id:
        raise ApiError(422, "group_not_found", f"group {group_id} belongs to another workspace")
    return group.id


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
