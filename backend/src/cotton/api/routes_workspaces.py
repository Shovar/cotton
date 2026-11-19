from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from cotton.errors import ApiError
from cotton.terminals.manager import TerminalManager
from cotton.workspaces.errors import InvalidWorkspace, WorkspaceExists, WorkspaceNotFound
from cotton.workspaces.repository import WorkspaceRepository


class WorkspaceCreateRequest(BaseModel):
    name: str
    path: str


class WorkspaceRenameRequest(BaseModel):
    name: str


def create_router(
    repository: WorkspaceRepository, manager: TerminalManager | None = None
) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["workspaces"])

    @router.get("/workspaces")
    async def list_workspaces() -> list[dict[str, Any]]:
        return [workspace.to_dict() for workspace in repository.list()]

    @router.post("/workspaces", status_code=201)
    async def create_workspace(body: WorkspaceCreateRequest) -> dict[str, Any]:
        try:
            return repository.create(body.name, body.path).to_dict()
        except WorkspaceExists as exc:
            raise ApiError(409, "workspace_exists", str(exc)) from exc
        except InvalidWorkspace as exc:
            raise ApiError(422, "validation_error", str(exc)) from exc

    @router.patch("/workspaces/{workspace_id}")
    async def rename_workspace(workspace_id: str, body: WorkspaceRenameRequest) -> dict[str, Any]:
        try:
            return repository.rename(workspace_id, body.name).to_dict()
        except WorkspaceNotFound as exc:
            raise ApiError(404, "workspace_not_found", str(exc)) from exc
        except InvalidWorkspace as exc:
            raise ApiError(422, "validation_error", str(exc)) from exc

    @router.delete("/workspaces/{workspace_id}")
    async def delete_workspace(workspace_id: str) -> dict[str, Any]:
        if manager is not None and manager.list(workspace_id):
            raise ApiError(
                409, "workspace_has_terminals", f"workspace {workspace_id} has open terminals"
            )
        try:
            repository.delete(workspace_id)
        except WorkspaceNotFound as exc:
            raise ApiError(404, "workspace_not_found", str(exc)) from exc
        return {"id": workspace_id}

    return router
