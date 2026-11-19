from __future__ import annotations

import asyncio
from collections.abc import Sequence
from functools import partial
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from cotton.api.routes_terminal_groups import create_router
from cotton.app import create_app
from cotton.services import Services
from cotton.terminals.manager import TerminalManager
from cotton.terminals.ports import PtySession
from cotton.workspaces.models import Workspace
from cotton.workspaces.repository import SqliteWorkspaceRepository


class IdlePtySession:
    def __init__(self) -> None:
        self.pid = 4242

    async def read(self) -> bytes | None:
        await asyncio.sleep(3600)
        return None

    async def write(self, data: bytes) -> None:
        pass

    async def resize(self, cols: int, rows: int) -> None:
        pass

    def has_foreground_job(self) -> bool:
        return False

    async def close(self) -> int:
        return 0


class IdleSpawner:
    async def spawn(self, argv: Sequence[str], cwd: Path, env: dict[str, str]) -> PtySession:
        return IdlePtySession()


@pytest.fixture
def repository(services: Services) -> SqliteWorkspaceRepository:
    services.db.migrate()
    return SqliteWorkspaceRepository(services.db)


@pytest.fixture
def manager(services: Services) -> TerminalManager:
    return TerminalManager(services.bus, IdleSpawner())


@pytest.fixture
def client(
    services: Services, repository: SqliteWorkspaceRepository, manager: TerminalManager
) -> TestClient:
    services.routers.append(create_router(repository, manager))
    services.shutdown.append(manager.shutdown)
    return TestClient(create_app(services))


@pytest.fixture
def workspace(repository: SqliteWorkspaceRepository, tmp_path: Path) -> Workspace:
    return repository.create("ws", str(tmp_path))


def test_groups_can_be_created_renamed_and_deleted(
    client: TestClient, workspace: Workspace, auth_headers: dict[str, str]
) -> None:
    with client:
        created = client.post(
            f"/api/workspaces/{workspace.id}/groups", json={"name": "Second"}, headers=auth_headers
        )
        group_id = created.json()["id"]
        renamed = client.patch(
            f"/api/terminal-groups/{group_id}", json={"name": "Renamed"}, headers=auth_headers
        )
        listed = client.get(f"/api/workspaces/{workspace.id}/groups", headers=auth_headers)
        deleted = client.delete(f"/api/terminal-groups/{group_id}", headers=auth_headers)

    assert created.status_code == 201
    assert created.json()["position"] == 1
    assert renamed.json()["name"] == "Renamed"
    assert [group["name"] for group in listed.json()] == ["Default", "Renamed"]
    assert deleted.json() == {"id": group_id}


def test_occupied_group_cannot_be_deleted(
    client: TestClient,
    manager: TerminalManager,
    repository: SqliteWorkspaceRepository,
    workspace: Workspace,
    auth_headers: dict[str, str],
) -> None:
    group_id = repository.list_groups(workspace.id)[0].id
    with client:
        client.portal.call(partial(manager.start, workspace_id=workspace.id, group_id=group_id))
        response = client.delete(f"/api/terminal-groups/{group_id}", headers=auth_headers)

    assert response.status_code == 409
    assert response.json()["code"] == "group_not_empty"


def test_last_group_cannot_be_deleted(
    client: TestClient,
    repository: SqliteWorkspaceRepository,
    workspace: Workspace,
    auth_headers: dict[str, str],
) -> None:
    group_id = repository.list_groups(workspace.id)[0].id
    with client:
        response = client.delete(f"/api/terminal-groups/{group_id}", headers=auth_headers)

    assert response.status_code == 409
    assert response.json()["code"] == "group_is_last"


def test_unknown_workspace_and_group_are_rejected(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    with client:
        workspace = client.get("/api/workspaces/ws_missing/groups", headers=auth_headers)
        created = client.post(
            "/api/workspaces/ws_missing/groups", json={"name": "x"}, headers=auth_headers
        )
        renamed = client.patch(
            "/api/terminal-groups/grp_missing", json={"name": "x"}, headers=auth_headers
        )
        deleted = client.delete("/api/terminal-groups/grp_missing", headers=auth_headers)

    assert (workspace.status_code, workspace.json()["code"]) == (404, "workspace_not_found")
    assert (created.status_code, created.json()["code"]) == (404, "workspace_not_found")
    assert (renamed.status_code, renamed.json()["code"]) == (404, "group_not_found")
    assert (deleted.status_code, deleted.json()["code"]) == (404, "group_not_found")


def test_invalid_group_name_is_rejected(
    client: TestClient, workspace: Workspace, auth_headers: dict[str, str]
) -> None:
    with client:
        response = client.post(
            f"/api/workspaces/{workspace.id}/groups", json={"name": "  "}, headers=auth_headers
        )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
