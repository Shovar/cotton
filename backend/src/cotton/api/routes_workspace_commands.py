from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from cotton.errors import ApiError
from cotton.terminals.manager import TerminalManager
from cotton.terminals.shell_input import compose_initial_input
from cotton.workspaces.commands import (
    CommandNotFound,
    CommandRepository,
    InvalidCommand,
    StartupCommandExists,
    WorkspaceCommand,
)
from cotton.workspaces.errors import GroupNotFound, WorkspaceNotFound
from cotton.workspaces.models import Workspace
from cotton.workspaces.repository import WorkspaceRepository


class CommandCreateRequest(BaseModel):
    label: str
    body: str
    is_startup: bool = False


class CommandUpdateRequest(BaseModel):
    label: str | None = None
    body: str | None = None
    is_startup: bool | None = None


class CommandRunRequest(BaseModel):
    group_id: str | None = None


def create_router(
    workspaces: WorkspaceRepository,
    commands: CommandRepository,
    manager: TerminalManager,
) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["workspace-commands"])

    @router.get("/workspaces/{workspace_id}/commands")
    async def list_commands(workspace_id: str) -> list[dict[str, Any]]:
        _workspace(workspaces, workspace_id)
        return [command.to_dict() for command in commands.list(workspace_id)]

    @router.post("/workspaces/{workspace_id}/commands", status_code=201)
    async def create_command(workspace_id: str, body: CommandCreateRequest) -> dict[str, Any]:
        _workspace(workspaces, workspace_id)
        try:
            command = commands.create(
                workspace_id, body.label, body.body, is_startup=body.is_startup
            )
        except StartupCommandExists as exc:
            raise ApiError(409, "startup_command_exists", str(exc)) from exc
        except InvalidCommand as exc:
            raise ApiError(422, "validation_error", str(exc)) from exc
        return command.to_dict()

    @router.patch("/workspace-commands/{command_id}")
    async def update_command(command_id: str, body: CommandUpdateRequest) -> dict[str, Any]:
        try:
            existing = commands.get(command_id)
            command = commands.update(
                command_id,
                body.label if body.label is not None else existing.label,
                body.body if body.body is not None else existing.body,
                body.is_startup if body.is_startup is not None else existing.is_startup,
            )
        except CommandNotFound as exc:
            raise ApiError(404, "command_not_found", str(exc)) from exc
        except InvalidCommand as exc:
            raise ApiError(422, "validation_error", str(exc)) from exc
        return command.to_dict()

    @router.delete("/workspace-commands/{command_id}")
    async def delete_command(command_id: str) -> dict[str, Any]:
        try:
            commands.delete(command_id)
        except CommandNotFound as exc:
            raise ApiError(404, "command_not_found", str(exc)) from exc
        return {"id": command_id}

    @router.post("/workspaces/{workspace_id}/commands/{command_id}/run", status_code=201)
    async def run_command(
        workspace_id: str, command_id: str, body: CommandRunRequest
    ) -> dict[str, Any]:
        workspace = _workspace(workspaces, workspace_id)
        command = _command_for(commands, workspace_id, command_id)
        group_id = _group_id(workspaces, workspace, body.group_id)
        startup = commands.startup_for(workspace_id)
        try:
            record = await manager.start(
                None,
                workspace_id=workspace.id,
                group_id=group_id,
                cwd=workspace.path,
                initial_input=compose_initial_input(
                    startup.body if startup else None, command.body
                ),
            )
        except ValueError as exc:
            raise ApiError(422, "validation_error", str(exc)) from exc
        return record.to_dict()

    return router


def _workspace(workspaces: WorkspaceRepository, workspace_id: str) -> Workspace:
    try:
        return workspaces.get(workspace_id)
    except WorkspaceNotFound as exc:
        raise ApiError(404, "workspace_not_found", str(exc)) from exc


def _command_for(
    commands: CommandRepository, workspace_id: str, command_id: str
) -> WorkspaceCommand:
    try:
        command = commands.get(command_id)
    except CommandNotFound as exc:
        raise ApiError(404, "command_not_found", str(exc)) from exc
    if command.workspace_id != workspace_id:
        raise ApiError(
            404, "command_not_found", f"command {command_id} belongs to another workspace"
        )
    return command


def _group_id(workspaces: WorkspaceRepository, workspace: Workspace, group_id: str | None) -> str:
    groups = workspaces.list_groups(workspace.id)
    if group_id is None:
        return groups[0].id
    try:
        group = workspaces.get_group(group_id)
    except GroupNotFound as exc:
        raise ApiError(422, "group_not_found", str(exc)) from exc
    if group.workspace_id != workspace.id:
        raise ApiError(422, "group_not_found", f"group {group_id} belongs to another workspace")
    return group.id
