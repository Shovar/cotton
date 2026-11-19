from __future__ import annotations

import asyncio
from collections.abc import Sequence
from functools import partial
from pathlib import Path
from typing import NamedTuple

import pytest
from fastapi.testclient import TestClient

from cotton.api.routes_workspaces import create_router
from cotton.app import create_app
from cotton.services import Services
from cotton.terminals.manager import TerminalManager
from cotton.terminals.ports import PtySession
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


class Api(NamedTuple):
    manager: TerminalManager
    repository: SqliteWorkspaceRepository
    client: TestClient


@pytest.fixture
def api(services: Services) -> Api:
    services.db.migrate()
    repository = SqliteWorkspaceRepository(services.db)
    manager = TerminalManager(services.bus, IdleSpawner())
    services.routers.append(create_router(repository, manager))
    services.shutdown.append(manager.shutdown)
    return Api(manager, repository, TestClient(create_app(services)))


def test_create_returns_the_canonical_path(
    api: Api, auth_headers: dict[str, str], tmp_path: Path
) -> None:
    with api.client:
        response = api.client.post(
            "/api/workspaces",
            json={"name": "ws", "path": str(tmp_path / ".")},
            headers=auth_headers,
        )

    assert response.status_code == 201
    assert response.json()["path"] == str(tmp_path.resolve())
    assert response.json()["name"] == "ws"


def test_duplicate_and_invalid_paths_are_rejected(
    api: Api, auth_headers: dict[str, str], tmp_path: Path
) -> None:
    file_path = tmp_path / "file.txt"
    file_path.write_text("x")
    with api.client:
        api.client.post(
            "/api/workspaces", json={"name": "ws", "path": str(tmp_path)}, headers=auth_headers
        )
        duplicate = api.client.post(
            "/api/workspaces", json={"name": "other", "path": str(tmp_path)}, headers=auth_headers
        )
        as_file = api.client.post(
            "/api/workspaces", json={"name": "file", "path": str(file_path)}, headers=auth_headers
        )

    assert (duplicate.status_code, duplicate.json()["code"]) == (409, "workspace_exists")
    assert (as_file.status_code, as_file.json()["code"]) == (422, "validation_error")


def test_rename_and_delete(api: Api, auth_headers: dict[str, str], tmp_path: Path) -> None:
    with api.client:
        created = api.client.post(
            "/api/workspaces", json={"name": "ws", "path": str(tmp_path)}, headers=auth_headers
        ).json()
        renamed = api.client.patch(
            f"/api/workspaces/{created['id']}", json={"name": "renamed"}, headers=auth_headers
        )
        listed = api.client.get("/api/workspaces", headers=auth_headers)
        deleted = api.client.delete(f"/api/workspaces/{created['id']}", headers=auth_headers)
        after = api.client.get("/api/workspaces", headers=auth_headers)

    assert renamed.status_code == 200
    assert renamed.json()["name"] == "renamed"
    assert [workspace["name"] for workspace in listed.json()] == ["renamed"]
    assert deleted.status_code == 200
    assert after.json() == []


def test_unknown_workspace_returns_not_found(api: Api, auth_headers: dict[str, str]) -> None:
    with api.client:
        renamed = api.client.patch(
            "/api/workspaces/ws_missing", json={"name": "x"}, headers=auth_headers
        )
        deleted = api.client.delete("/api/workspaces/ws_missing", headers=auth_headers)

    assert (renamed.status_code, renamed.json()["code"]) == (404, "workspace_not_found")
    assert (deleted.status_code, deleted.json()["code"]) == (404, "workspace_not_found")


def test_delete_with_live_terminals_is_rejected(
    api: Api, auth_headers: dict[str, str], tmp_path: Path
) -> None:
    workspace = api.repository.create("ws", str(tmp_path))
    group_id = api.repository.list_groups(workspace.id)[0].id
    with api.client:
        api.client.portal.call(
            partial(api.manager.start, workspace_id=workspace.id, group_id=group_id)
        )
        response = api.client.delete(f"/api/workspaces/{workspace.id}", headers=auth_headers)

    assert response.status_code == 409
    assert response.json()["code"] == "workspace_has_terminals"


def test_workspaces_require_a_token(api: Api) -> None:
    with api.client:
        response = api.client.get("/api/workspaces")

    assert response.status_code == 401
