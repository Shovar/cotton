from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from cotton.errors import ApiError
from cotton.terminals.manager import TerminalManager
from cotton.workspaces.errors import (
    GroupNotFound,
    InvalidWorkspace,
    WorkspaceNotFound,
)
from cotton.workspaces.repository import WorkspaceRepository


class GroupCreateRequest(BaseModel):
    name: str


class GroupRenameRequest(BaseModel):
    name: str


def create_router(repository: WorkspaceRepository, manager: TerminalManager) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["terminal-groups"])

    @router.get("/workspaces/{workspace_id}/groups")
    async def list_groups(workspace_id: str) -> list[dict[str, Any]]:
        await _workspace(repository, workspace_id)
        return [group.to_dict() for group in repository.list_groups(workspace_id)]

    @router.post("/workspaces/{workspace_id}/groups", status_code=201)
    async def create_group(workspace_id: str, body: GroupCreateRequest) -> dict[str, Any]:
        await _workspace(repository, workspace_id)
        try:
            return repository.create_group(workspace_id, body.name).to_dict()
        except InvalidWorkspace as exc:
            raise ApiError(422, "validation_error", str(exc)) from exc

    @router.patch("/terminal-groups/{group_id}")
    async def rename_group(group_id: str, body: GroupRenameRequest) -> dict[str, Any]:
        try:
            return repository.rename_group(group_id, body.name).to_dict()
        except GroupNotFound as exc:
            raise ApiError(404, "group_not_found", str(exc)) from exc
        except InvalidWorkspace as exc:
            raise ApiError(422, "validation_error", str(exc)) from exc

    @router.delete("/terminal-groups/{group_id}")
    async def delete_group(group_id: str) -> dict[str, Any]:
        try:
            group = repository.get_group(group_id)
        except GroupNotFound as exc:
            raise ApiError(404, "group_not_found", str(exc)) from exc
        occupied = any(
            record.spec.group_id == group_id for record in manager.list(group.workspace_id)
        )
        if occupied:
            raise ApiError(409, "group_not_empty", f"group {group_id} has open terminals")
        if len(repository.list_groups(group.workspace_id)) <= 1:
            raise ApiError(409, "group_is_last", "a workspace keeps at least one group")
        repository.delete_group(group_id)
        return {"id": group_id}

    return router


async def _workspace(repository: WorkspaceRepository, workspace_id: str) -> None:
    try:
        repository.get(workspace_id)
    except WorkspaceNotFound as exc:
        raise ApiError(404, "workspace_not_found", str(exc)) from exc
