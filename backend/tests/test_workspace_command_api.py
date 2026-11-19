from __future__ import annotations

import asyncio
import time
from collections.abc import Sequence
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from cotton.api.routes_terminal_groups import create_router as create_groups_router
from cotton.api.routes_terminals import create_router as create_terminals_router
from cotton.api.routes_workspace_commands import create_router
from cotton.app import create_app
from cotton.services import Services
from cotton.terminals.manager import TerminalManager
from cotton.terminals.models import TerminalRecord
from cotton.terminals.ports import PtySession
from cotton.workspaces.commands import SqliteCommandRepository
from cotton.workspaces.models import Workspace
from cotton.workspaces.repository import SqliteWorkspaceRepository


class RecordingPtySession:
    def __init__(self, prompt: bytes | None) -> None:
        self.pid = 4242
        self._prompt = prompt
        self.writes: list[bytes] = []
        self.events: list[str] = []

    async def read(self) -> bytes | None:
        self.events.append("read")
        prompt, self._prompt = self._prompt, None
        if prompt is not None:
            return prompt
        await asyncio.sleep(3600)
        return None

    async def write(self, data: bytes) -> None:
        self.events.append("write")
        self.writes.append(data)

    async def resize(self, cols: int, rows: int) -> None:
        pass

    def has_foreground_job(self) -> bool:
        return False

    async def close(self) -> int:
        return 0


class RecordingSpawner:
    def __init__(self, prompt: bytes | None = b"$ ") -> None:
        self._prompt = prompt
        self.sessions: list[RecordingPtySession] = []
        self.calls: list[tuple[tuple[str, ...], Path]] = []

    async def spawn(self, argv: Sequence[str], cwd: Path, env: dict[str, str]) -> PtySession:
        self.calls.append((tuple(argv), cwd))
        session = RecordingPtySession(self._prompt)
        self.sessions.append(session)
        return session


class Api:
    def __init__(
        self,
        manager: TerminalManager,
        spawner: RecordingSpawner,
        workspaces: SqliteWorkspaceRepository,
        commands: SqliteCommandRepository,
        workspace: Workspace,
        client: TestClient,
    ) -> None:
        self.manager = manager
        self.spawner = spawner
        self.workspaces = workspaces
        self.commands = commands
        self.workspace = workspace
        self.client = client


@pytest.fixture
def api(services: Services, tmp_path: Path) -> Api:
    services.db.migrate()
    workspaces = SqliteWorkspaceRepository(services.db)
    commands = SqliteCommandRepository(services.db)
    spawner = RecordingSpawner()
    manager = TerminalManager(services.bus, spawner, startup_grace_seconds=0.01)
    workspace = workspaces.create("ws", str(tmp_path))
    services.routers.append(create_router(workspaces, commands, manager))
    services.routers.append(create_terminals_router(manager, workspaces, commands))
    services.routers.append(create_groups_router(workspaces, manager))
    services.shutdown.append(manager.shutdown)
    return Api(manager, spawner, workspaces, commands, workspace, TestClient(create_app(services)))


def create_command(
    api: Api, auth_headers: dict[str, str], *, label: str, body: str, is_startup: bool = False
) -> dict[str, object]:
    response = api.client.post(
        f"/api/workspaces/{api.workspace.id}/commands",
        json={"label": label, "body": body, "is_startup": is_startup},
        headers=auth_headers,
    )
    assert response.status_code == 201
    return response.json()


def test_commands_round_trip(api: Api, auth_headers: dict[str, str]) -> None:
    with api.client:
        created = create_command(api, auth_headers, label="Build", body="colcon build")
        listed = api.client.get(
            f"/api/workspaces/{api.workspace.id}/commands", headers=auth_headers
        )
        updated = api.client.patch(
            f"/api/workspace-commands/{created['id']}",
            json={"body": "colcon build --packages-select demo"},
            headers=auth_headers,
        )
        deleted = api.client.delete(
            f"/api/workspace-commands/{created['id']}", headers=auth_headers
        )
        after = api.client.get(f"/api/workspaces/{api.workspace.id}/commands", headers=auth_headers)

    assert [command["label"] for command in listed.json()] == ["Build"]
    assert updated.status_code == 200
    assert updated.json()["body"] == "colcon build --packages-select demo"
    assert updated.json()["label"] == "Build"
    assert deleted.json() == {"id": created["id"]}
    assert after.json() == []


def test_invalid_body_is_rejected_without_spawning(api: Api, auth_headers: dict[str, str]) -> None:
    with api.client:
        response = api.client.post(
            f"/api/workspaces/{api.workspace.id}/commands",
            json={"label": "Empty", "body": "  "},
            headers=auth_headers,
        )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert api.spawner.calls == []


def test_run_injects_the_startup_line_before_the_command(
    api: Api, auth_headers: dict[str, str]
) -> None:
    group_id = api.workspaces.list_groups(api.workspace.id)[0].id
    with api.client:
        create_command(
            api,
            auth_headers,
            label="Setup",
            body="source install/setup.bash",
            is_startup=True,
        )
        command = create_command(api, auth_headers, label="Launch", body="ros2 launch demo")
        response = api.client.post(
            f"/api/workspaces/{api.workspace.id}/commands/{command['id']}/run",
            json={"group_id": group_id},
            headers=auth_headers,
        )

        assert response.status_code == 201
        assert response.json()["spec"]["workspace_id"] == api.workspace.id
        assert response.json()["spec"]["group_id"] == group_id
        session = api.spawner.sessions[0]
        _wait_for_writes(session)

    assert len(api.spawner.calls) == 1
    assert session.writes == [b"source install/setup.bash && {\nros2 launch demo\n}\n"]


def test_run_without_startup_injects_only_the_body(api: Api, auth_headers: dict[str, str]) -> None:
    with api.client:
        command = create_command(api, auth_headers, label="Build", body="colcon build")
        api.client.post(
            f"/api/workspaces/{api.workspace.id}/commands/{command['id']}/run",
            json={},
            headers=auth_headers,
        )
        session = api.spawner.sessions[0]
        _wait_for_writes(session)

    assert session.writes == [b"colcon build\n"]


def test_new_shell_injects_the_startup_line(api: Api, auth_headers: dict[str, str]) -> None:
    with api.client:
        create_command(api, auth_headers, label="Setup", body="source setup.bash", is_startup=True)
        response = api.client.post(
            "/api/terminals",
            json={"workspace_id": api.workspace.id},
            headers=auth_headers,
        )
        session = api.spawner.sessions[0]
        _wait_for_writes(session)

    assert response.status_code == 201
    assert session.writes == [b"source setup.bash\n"]


def test_command_sessions_do_not_receive_the_startup_line(
    api: Api, auth_headers: dict[str, str]
) -> None:
    with api.client:
        create_command(api, auth_headers, label="Setup", body="source setup.bash", is_startup=True)
        api.client.post(
            "/api/terminals",
            json={"workspace_id": api.workspace.id, "command": "echo hello"},
            headers=auth_headers,
        )
        endpoint = api.client.post(
            f"/api/workspaces/{api.workspace.id}/commands",
            json={"label": "Other", "body": "echo other"},
            headers=auth_headers,
        )
        api.client.post(
            f"/api/workspaces/{api.workspace.id}/commands/{endpoint.json()['id']}/run",
            json={},
            headers=auth_headers,
        )
        sessions = api.spawner.sessions
        _wait_for_writes(sessions[-1])

    assert sessions[0].writes == []
    assert sessions[1].writes == [b"source setup.bash && {\necho other\n}\n"]


def test_unknown_command_and_workspace_are_not_found(
    api: Api, auth_headers: dict[str, str]
) -> None:
    with api.client:
        run_missing = api.client.post(
            f"/api/workspaces/{api.workspace.id}/commands/cmd_missing/run",
            json={},
            headers=auth_headers,
        )
        run_elsewhere = api.client.get("/api/workspaces/ws_missing/commands", headers=auth_headers)

    assert (run_missing.status_code, run_missing.json()["code"]) == (404, "command_not_found")
    assert (run_elsewhere.status_code, run_elsewhere.json()["code"]) == (
        404,
        "workspace_not_found",
    )


def test_second_startup_command_is_rejected(api: Api, auth_headers: dict[str, str]) -> None:
    with api.client:
        create_command(api, auth_headers, label="Setup", body="source setup.bash", is_startup=True)
        response = api.client.post(
            f"/api/workspaces/{api.workspace.id}/commands",
            json={"label": "Other", "body": "source other.bash", "is_startup": True},
            headers=auth_headers,
        )

    assert response.status_code == 409
    assert response.json()["code"] == "startup_command_exists"


def test_command_routes_require_a_token(api: Api) -> None:
    with api.client:
        listed = api.client.get(f"/api/workspaces/{api.workspace.id}/commands")
        run = api.client.post(f"/api/workspaces/{api.workspace.id}/commands/cmd_1/run", json={})

    assert listed.status_code == 401
    assert run.status_code == 401


def test_injection_waits_for_the_first_shell_output(services: Services, tmp_path: Path) -> None:
    spawner, manager, workspace, group_id = _bare_manager(services, tmp_path, prompt=b"$ ")
    record, session = asyncio.run(_start_with_input(manager, workspace, group_id, spawner))

    assert session.events[0] == "read"
    assert session.writes == [b"echo ready\n"]
    asyncio.run(manager.close(record.spec.id, force=True))


def test_silent_shell_gets_the_input_after_the_grace_period(
    services: Services, tmp_path: Path
) -> None:
    spawner, manager, workspace, group_id = _bare_manager(
        services, tmp_path, prompt=None, startup_grace_seconds=0.01
    )
    record, session = asyncio.run(_start_with_input(manager, workspace, group_id, spawner))

    assert session.writes == [b"echo ready\n"]
    asyncio.run(manager.close(record.spec.id, force=True))


def test_input_is_dropped_when_the_shell_closes_first(services: Services, tmp_path: Path) -> None:
    spawner, manager, workspace, group_id = _bare_manager(
        services, tmp_path, prompt=None, startup_grace_seconds=5
    )

    async def scenario() -> RecordingPtySession:
        record = await manager.start(
            workspace_id=workspace.id,
            group_id=group_id,
            cwd=workspace.path,
            initial_input="echo ready",
        )
        await asyncio.sleep(0.05)
        await manager.close(record.spec.id, force=True)
        await asyncio.sleep(0.05)
        return spawner.sessions[0]

    session = asyncio.run(scenario())
    assert session.writes == []


def _bare_manager(
    services: Services,
    tmp_path: Path,
    *,
    prompt: bytes | None,
    startup_grace_seconds: float = 0.05,
) -> tuple[RecordingSpawner, TerminalManager, Workspace, str]:
    services.db.migrate()
    workspaces = SqliteWorkspaceRepository(services.db)
    spawner = RecordingSpawner(prompt=prompt)
    manager = TerminalManager(services.bus, spawner, startup_grace_seconds=startup_grace_seconds)
    workspace = workspaces.create("ws", str(tmp_path))
    group_id = workspaces.list_groups(workspace.id)[0].id
    return spawner, manager, workspace, group_id


async def _start_with_input(
    manager: TerminalManager,
    workspace: Workspace,
    group_id: str,
    spawner: RecordingSpawner,
) -> tuple[TerminalRecord, RecordingPtySession]:
    record = await manager.start(
        workspace_id=workspace.id,
        group_id=group_id,
        cwd=workspace.path,
        initial_input="echo ready",
    )
    session = spawner.sessions[0]
    for _ in range(200):
        if session.writes:
            break
        await asyncio.sleep(0.01)
    return record, session


def _wait_for_writes(session: RecordingPtySession) -> None:
    for _ in range(200):
        if session.writes:
            return
        time.sleep(0.01)
    raise AssertionError(f"no input injected; writes={session.writes!r}")
