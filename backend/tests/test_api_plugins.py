from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from cotton.api.routes_plugins import create_router, register_plugin_channel
from cotton.app import create_app
from cotton.plugins.loader import PluginLoader
from cotton.plugins.manager import Healthcheck, HealthcheckError, PluginManager
from cotton.plugins.settings import SettingsRepository
from cotton.processes.models import ProcessRecord, ProcessSpec
from cotton.services import Services

TOKEN = "test-token"
ORIGIN = "http://testserver"


class FakeProcesses:
    def __init__(self) -> None:
        self.started: list[ProcessSpec] = []

    async def start(self, spec: ProcessSpec) -> ProcessRecord:
        self.started.append(spec)
        return ProcessRecord(
            id=spec.id,
            spec=spec,
            state="running",
            pid=4242,
            pgid=4242,
            started_at=datetime.now(timezone.utc),
        )

    async def stop(self, process_id: str) -> ProcessRecord:
        return ProcessRecord(
            id=process_id,
            spec=ProcessSpec(id=process_id, argv=["sleep", "1"]),
            state="exited",
            pid=None,
            pgid=None,
            started_at=datetime.now(timezone.utc),
        )


def write_plugin(root: Path, name: str, **overrides: object) -> None:
    data: dict[str, object] = {
        "name": name,
        "version": "0.1.0",
        "processes": [{"id": "bridge", "argv": ["sleep", "1"]}],
    }
    data.update(overrides)
    directory = root / name
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "plugin.yaml").write_text(yaml.safe_dump(data), encoding="utf-8")


async def healthcheck(check: Healthcheck) -> None:
    if check.url.endswith(":9"):
        raise HealthcheckError("bridge never came up")


@pytest.fixture
def plugin_manager(services: Services, tmp_path: Path) -> PluginManager:
    write_plugin(tmp_path / "builtin", "demo")
    write_plugin(
        tmp_path / "builtin",
        "broken",
        healthcheck={"url": "tcp://127.0.0.1:9", "retries": 1, "delay_s": 0.0},
    )
    manager = PluginManager(
        PluginLoader(tmp_path / "builtin", tmp_path / "user"),
        SettingsRepository(services.db),
        FakeProcesses(),
        services.bus,
        healthcheck=healthcheck,
    )
    services.routers.append(create_router(manager))
    register_plugin_channel(services.channels, manager)
    services.shutdown.append(manager.shutdown)
    return manager


def client_for(services: Services) -> TestClient:
    return TestClient(create_app(services))


def test_list_activate_and_deactivate_a_plugin(
    services: Services, plugin_manager: PluginManager, auth_headers: dict[str, str]
) -> None:
    with client_for(services) as client:
        listed = client.get("/api/plugins", headers=auth_headers)
        activated = client.post("/api/plugins/demo/activate", headers=auth_headers)
        deactivated = client.delete("/api/plugins/demo/activate", headers=auth_headers)

    assert listed.status_code == 200
    assert [(item["name"], item["state"]) for item in listed.json()] == [
        ("broken", "discovered"),
        ("demo", "discovered"),
    ]
    assert activated.status_code == 200
    assert activated.json()["state"] == "active"
    assert activated.json()["manifest"]["name"] == "demo"
    assert deactivated.status_code == 200
    assert deactivated.json()["state"] == "stopped"


def test_unknown_plugin_is_not_found(
    services: Services, plugin_manager: PluginManager, auth_headers: dict[str, str]
) -> None:
    with client_for(services) as client:
        response = client.post("/api/plugins/ghost/activate", headers=auth_headers)
        deleted = client.delete("/api/plugins/ghost/activate", headers=auth_headers)

    assert response.status_code == 404
    assert response.json()["code"] == "plugin_not_found"
    assert deleted.status_code == 404


def test_failed_healthcheck_is_a_plugin_error(
    services: Services, plugin_manager: PluginManager, auth_headers: dict[str, str]
) -> None:
    with client_for(services) as client:
        response = client.post("/api/plugins/broken/activate", headers=auth_headers)

    assert response.status_code == 409
    assert response.json()["code"] == "plugin_error"
    assert "bridge never came up" in response.json()["message"]


def test_websocket_backfills_plugins(services: Services, plugin_manager: PluginManager) -> None:
    with client_for(services) as client:
        with client.websocket_connect(
            f"/ws?token={TOKEN}", headers={"origin": ORIGIN}
        ) as websocket:
            websocket.send_json({"type": "subscribe", "channels": ["plugins"]})
            messages = [websocket.receive_json(), websocket.receive_json()]

    assert [message["type"] for message in messages] == ["plugin.state", "plugin.state"]
    assert {message["data"]["name"] for message in messages} == {"broken", "demo"}
