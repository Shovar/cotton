from __future__ import annotations

import asyncio
import os
from collections.abc import Sequence
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from cotton.api.routes_terminals import create_router
from cotton.app import create_app
from cotton.services import Services
from cotton.terminals.manager import TerminalManager, TerminalNotFound
from cotton.terminals.ports import PtySession


class FakePtySession:
    def __init__(self, wait_for_close: bool = False) -> None:
        self.pid = 4242
        self._wait_for_close = wait_for_close
        self._closed_event = asyncio.Event()
        self.closed = False

    async def read(self) -> bytes | None:
        if self._wait_for_close and not self.closed:
            await self._closed_event.wait()
        return None

    async def write(self, data: bytes) -> None:
        pass

    async def resize(self, cols: int, rows: int) -> None:
        pass

    def has_foreground_job(self) -> bool:
        return False

    async def close(self) -> int:
        self.closed = True
        self._closed_event.set()
        return 0


class PermissionDeniedPtySession(FakePtySession):
    async def close(self) -> int:
        raise PermissionError("operation not permitted")


class FakePtySpawner:
    def __init__(self, wait_for_close: bool = False) -> None:
        self.session = FakePtySession(wait_for_close)
        self.calls: list[tuple[tuple[str, ...], Path, dict[str, str]]] = []

    async def spawn(self, argv: Sequence[str], cwd: Path, env: dict[str, str]) -> PtySession:
        self.calls.append((tuple(argv), cwd, dict(env)))
        return self.session


def build_client(services: Services, spawner: FakePtySpawner) -> tuple[TerminalManager, TestClient]:
    manager = TerminalManager(services.bus, spawner)
    services.routers.append(create_router(manager))
    services.shutdown.append(manager.shutdown)
    return manager, TestClient(create_app(services))


def test_list_create_default_shell_and_close(
    services: Services, auth_headers: dict[str, str], tmp_path: Path
) -> None:
    spawner = FakePtySpawner()
    manager, client = build_client(services, spawner)
    with client:
        assert client.get("/api/terminals", headers=auth_headers).json() == []
        created = client.post(
            "/api/terminals",
            json={"cwd": str(tmp_path)},
            headers=auth_headers,
        )
        terminal_id = created.json()["spec"]["id"]
        listed = client.get("/api/terminals", headers=auth_headers)
        closed = client.delete(f"/api/terminals/{terminal_id}", headers=auth_headers)
        after_close = client.get("/api/terminals", headers=auth_headers)

    assert created.status_code == 201
    assert created.json()["spec"]["kind"] == "shell"
    assert created.json()["spec"]["argv"] == [os.environ.get("SHELL") or "/bin/sh"]
    assert [record["spec"]["id"] for record in listed.json()] == [terminal_id]
    assert closed.status_code == 200
    assert closed.json()["state"] == "exited"
    assert after_close.json() == []
    assert spawner.session.closed
    with pytest.raises(TerminalNotFound):
        manager.get(terminal_id)


def test_command_string_uses_shlex_without_shell_evaluation(
    services: Services, auth_headers: dict[str, str], tmp_path: Path
) -> None:
    spawner = FakePtySpawner(wait_for_close=True)
    _, client = build_client(services, spawner)
    marker = tmp_path / "must-not-exist"
    command = f"echo '$(touch {marker})'"
    with client:
        response = client.post(
            "/api/terminals",
            json={"command": command},
            headers=auth_headers,
        )

    assert response.status_code == 201
    assert spawner.calls[0][0] == ("echo", f"$(touch {marker})")
    assert not marker.exists()


@pytest.mark.parametrize(
    "body",
    [
        {"command": ""},
        {"command": []},
        {"command": [""]},
        {"command": "echo\x00bad"},
        {"command": ["echo", "\x00bad"]},
        {"env": {"BAD-KEY": "value"}},
        {"env": {"KEY": "bad\x00value"}},
        {"env": {"KEY": 7}},
        {"cwd": "/path/that/does/not/exist"},
    ],
)
def test_invalid_terminal_request_is_rejected_without_spawning(
    services: Services, auth_headers: dict[str, str], body: dict[str, object]
) -> None:
    spawner = FakePtySpawner()
    _, client = build_client(services, spawner)
    with client:
        response = client.post("/api/terminals", json=body, headers=auth_headers)

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert spawner.calls == []


def test_terminal_api_requires_bearer_token(services: Services) -> None:
    _, client = build_client(services, FakePtySpawner())
    with client:
        response = client.get("/api/terminals")

    assert response.status_code == 401
    assert response.json() == {
        "code": "unauthorized",
        "message": "Missing or invalid bearer token",
    }


def test_busy_terminal_requires_confirmation_and_force_closes(
    services: Services, auth_headers: dict[str, str]
) -> None:
    spawner = FakePtySpawner(wait_for_close=True)
    _, client = build_client(services, spawner)
    with client:
        created = client.post(
            "/api/terminals",
            json={"command": ["python", "-c", "pass"]},
            headers=auth_headers,
        )
        terminal_id = created.json()["spec"]["id"]
        busy = client.delete(f"/api/terminals/{terminal_id}", headers=auth_headers)
        forced = client.delete(
            f"/api/terminals/{terminal_id}?force=true",
            headers=auth_headers,
        )

    assert busy.status_code == 409
    assert busy.json()["code"] == "terminal_busy"
    assert forced.status_code == 200
    assert forced.json()["state"] == "exited"
    assert spawner.session.closed


def test_unknown_terminal_delete_returns_not_found(
    services: Services, auth_headers: dict[str, str]
) -> None:
    _, client = build_client(services, FakePtySpawner())
    with client:
        response = client.delete("/api/terminals/ghost", headers=auth_headers)

    assert response.status_code == 404
    assert response.json()["code"] == "terminal_not_found"


def test_close_permission_error_is_reported_and_marks_terminal_failed(
    services: Services, auth_headers: dict[str, str]
) -> None:
    spawner = FakePtySpawner()
    spawner.session = PermissionDeniedPtySession()
    manager, client = build_client(services, spawner)
    with client:
        created = client.post(
            "/api/terminals",
            json={"command": ["python", "-c", "pass"]},
            headers=auth_headers,
        )
        terminal_id = created.json()["spec"]["id"]
        response = client.delete(
            f"/api/terminals/{terminal_id}?force=true",
            headers=auth_headers,
        )

    assert response.status_code == 409
    assert response.json() == {
        "code": "terminal_close_failed",
        "message": "operation not permitted",
    }
    assert manager.get(terminal_id).state.value == "failed"
    assert manager.get(terminal_id).error == "operation not permitted"
