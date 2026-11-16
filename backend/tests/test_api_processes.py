from __future__ import annotations

import sys
import time
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from cotton.api.routes_processes import create_router, register_process_channels
from cotton.app import create_app
from cotton.processes.manager import ProcessManager, StopTimeouts
from cotton.processes.models import ProcessSpec
from cotton.services import Services

TOKEN = "test-token"
ORIGIN = "http://testserver"


@pytest.fixture
def manager(services: Services, tmp_path: Path) -> Iterator[ProcessManager]:
    instance = ProcessManager(
        bus=services.bus,
        logs_dir=tmp_path / "logs",
        stop_timeouts=StopTimeouts(interrupt=0.2, terminate=0.2),
    )
    services.routers.append(create_router(instance))
    register_process_channels(services.channels, instance)
    services.shutdown.append(instance.shutdown)
    yield instance


def client_for(services: Services) -> TestClient:
    return TestClient(create_app(services))


def sleeper(seconds: int = 30) -> list[str]:
    return [sys.executable, "-c", f"import time; time.sleep({seconds})"]


def wait_for(predicate: Callable[[], bool], timeout: float = 3.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError("condition did not become true")


def test_create_list_and_stop_a_process(
    services: Services, manager: ProcessManager, auth_headers: dict[str, str]
) -> None:
    with client_for(services) as client:
        created = client.post(
            "/api/processes",
            json={"id": "sleepy", "command": sleeper()},
            headers=auth_headers,
        )
        assert created.status_code == 201
        assert created.json()["state"] == "running"

        listed = client.get("/api/processes", headers=auth_headers)
        assert [record["id"] for record in listed.json()] == ["sleepy"]

        stopped = client.delete("/api/processes/sleepy", headers=auth_headers)

    assert stopped.status_code == 200
    assert stopped.json()["state"] == "exited"


def test_command_string_is_split_with_shlex(
    services: Services, manager: ProcessManager, auth_headers: dict[str, str]
) -> None:
    with client_for(services) as client:
        created = client.post("/api/processes", json={"command": "sleep 30"}, headers=auth_headers)

    assert created.status_code == 201
    assert created.json()["spec"]["argv"] == ["sleep", "30"]
    assert created.json()["id"].startswith("p_")


def test_duplicate_active_id_conflicts(
    services: Services, manager: ProcessManager, auth_headers: dict[str, str]
) -> None:
    with client_for(services) as client:
        client.post(
            "/api/processes", json={"id": "dup", "command": sleeper()}, headers=auth_headers
        )
        again = client.post(
            "/api/processes", json={"id": "dup", "command": sleeper()}, headers=auth_headers
        )

    assert again.status_code == 409
    assert again.json()["code"] == "process_conflict"


def test_invalid_command_is_a_validation_error(
    services: Services, manager: ProcessManager, auth_headers: dict[str, str]
) -> None:
    with client_for(services) as client:
        response = client.post("/api/processes", json={"command": []}, headers=auth_headers)

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_unknown_process_is_not_found(
    services: Services, manager: ProcessManager, auth_headers: dict[str, str]
) -> None:
    with client_for(services) as client:
        assert client.delete("/api/processes/ghost", headers=auth_headers).status_code == 404
        assert client.post("/api/processes/ghost/restart", headers=auth_headers).status_code == 404
        logs = client.get("/api/processes/ghost/logs", headers=auth_headers)

    assert logs.status_code == 404
    assert logs.json()["code"] == "process_not_found"


def test_logs_return_the_newest_lines(
    services: Services, manager: ProcessManager, auth_headers: dict[str, str]
) -> None:
    script = "print('uno', flush=True); print('dos', flush=True)"

    with client_for(services) as client:
        client.post(
            "/api/processes",
            json={"id": "talky", "command": [sys.executable, "-c", script]},
            headers=auth_headers,
        )
        wait_for(lambda: manager.get("talky").state == "exited")
        response = client.get("/api/processes/talky/logs?lines=1", headers=auth_headers)

    assert response.status_code == 200
    assert [line["text"] for line in response.json()] == ["dos"]


def test_close_removes_the_terminal(
    services: Services, manager: ProcessManager, auth_headers: dict[str, str]
) -> None:
    with client_for(services) as client:
        client.post(
            "/api/processes", json={"id": "bye", "command": sleeper()}, headers=auth_headers
        )
        closed = client.post("/api/processes/bye/close", headers=auth_headers)
        listed = client.get("/api/processes", headers=auth_headers)
        again = client.post("/api/processes/bye/close", headers=auth_headers)

    assert closed.status_code == 200
    assert closed.json()["state"] == "exited"
    assert listed.json() == []
    assert again.status_code == 404
    assert again.json()["code"] == "process_not_found"


def test_websocket_forwards_process_removal(
    services: Services, manager: ProcessManager, auth_headers: dict[str, str]
) -> None:
    with client_for(services) as client:
        client.portal.call(manager.start, ProcessSpec(id="removable", argv=sleeper()))
        with client.websocket_connect(
            f"/ws?token={TOKEN}", headers={"origin": ORIGIN}
        ) as websocket:
            websocket.send_json({"type": "subscribe", "channels": ["processes"]})
            initial = websocket.receive_json()
            client.portal.call(manager.close, "removable")
            messages = [websocket.receive_json() for _ in range(3)]

    assert initial["type"] == "process.state"
    assert initial["data"]["id"] == "removable"
    assert messages[-1] == {"type": "process.removed", "data": {"id": "removable"}}


def test_websocket_backfills_processes_and_logs(
    services: Services, manager: ProcessManager, auth_headers: dict[str, str]
) -> None:
    script = "print('hola', flush=True); import time; time.sleep(30)"

    with client_for(services) as client:
        client.portal.call(
            manager.start, ProcessSpec(id="loggy", argv=[sys.executable, "-c", script])
        )
        wait_for(lambda: manager.logs("loggy").tail(10) != [])

        with client.websocket_connect(
            f"/ws?token={TOKEN}", headers={"origin": ORIGIN}
        ) as websocket:
            websocket.send_json({"type": "subscribe", "channels": ["processes", "logs:loggy"]})
            first = websocket.receive_json()
            second = websocket.receive_json()
            expected = {"type": "process.state", "data": manager.get("loggy").to_dict()}

    assert first == expected
    assert second["type"] == "process.log"
    assert second["data"]["text"] == "hola"


def test_websocket_rejects_logs_channel_of_unknown_process(
    services: Services, manager: ProcessManager
) -> None:
    with client_for(services) as client:
        with client.websocket_connect(
            f"/ws?token={TOKEN}", headers={"origin": ORIGIN}
        ) as websocket:
            websocket.send_json({"type": "subscribe", "channels": ["logs:ghost"]})
            message = websocket.receive_json()

    assert message["data"]["code"] == "unknown_channel"
