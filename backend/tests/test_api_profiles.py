from __future__ import annotations

import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ros_studio.api.routes_profiles import create_router
from ros_studio.app import create_app
from ros_studio.processes.manager import ProcessManager, StopTimeouts
from ros_studio.processes.profiles import ProfileRepository
from ros_studio.services import Services

SLEEPER = [sys.executable, "-c", "import time; time.sleep(30)"]


@pytest.fixture
def manager(services: Services, tmp_path: Path) -> Iterator[ProcessManager]:
    instance = ProcessManager(
        bus=services.bus,
        logs_dir=tmp_path / "logs",
        stop_timeouts=StopTimeouts(interrupt=0.2, terminate=0.2),
    )
    services.shutdown.append(instance.shutdown)
    yield instance


@pytest.fixture
def profiles(services: Services, manager: ProcessManager) -> ProfileRepository:
    repository = ProfileRepository(services.db)
    services.routers.append(create_router(manager, repository))
    return repository


def body(processes: list[dict[str, object]], name: str = "Simulation") -> dict[str, object]:
    return {"id": "sim", "name": name, "processes": processes}


def client_for(services: Services) -> TestClient:
    return TestClient(create_app(services))


def test_profile_crud(
    services: Services,
    manager: ProcessManager,
    profiles: ProfileRepository,
    auth_headers: dict[str, str],
) -> None:
    with client_for(services) as client:
        created = client.post(
            "/api/profiles",
            json=body([{"id": "a", "argv": ["sleep", "1"]}]),
            headers=auth_headers,
        )
        assert created.status_code == 201
        assert created.json()["name"] == "Simulation"

        listed = client.get("/api/profiles", headers=auth_headers)
        assert [profile["id"] for profile in listed.json()] == ["sim"]

        updated = client.put(
            "/api/profiles/sim", json=body([], name="Renamed"), headers=auth_headers
        )
        assert updated.status_code == 200
        assert updated.json()["name"] == "Renamed"

        deleted = client.delete("/api/profiles/sim", headers=auth_headers)

    assert deleted.status_code == 204
    assert profiles.list() == []


def test_unknown_profile_is_not_found(
    services: Services,
    manager: ProcessManager,
    profiles: ProfileRepository,
    auth_headers: dict[str, str],
) -> None:
    with client_for(services) as client:
        put = client.put("/api/profiles/ghost", json=body([]), headers=auth_headers)
        delete = client.delete("/api/profiles/ghost", headers=auth_headers)
        start = client.post("/api/profiles/ghost/start", headers=auth_headers)

    assert put.status_code == 404
    assert delete.status_code == 404
    assert start.status_code == 404
    assert start.json()["code"] == "not_found"


def test_invalid_profile_is_a_validation_error(
    services: Services,
    manager: ProcessManager,
    profiles: ProfileRepository,
    auth_headers: dict[str, str],
) -> None:
    with client_for(services) as client:
        response = client.post("/api/profiles", json=body([{"id": "a"}]), headers=auth_headers)

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_start_runs_processes_in_listed_order(
    services: Services,
    manager: ProcessManager,
    profiles: ProfileRepository,
    auth_headers: dict[str, str],
) -> None:
    with client_for(services) as client:
        client.post(
            "/api/profiles",
            json=body([{"id": "a", "argv": SLEEPER}, {"id": "b", "argv": SLEEPER}]),
            headers=auth_headers,
        )
        started = client.post("/api/profiles/sim/start", headers=auth_headers)

    assert started.status_code == 200
    assert [record["id"] for record in started.json()] == ["a", "b"]
    assert [record["state"] for record in started.json()] == ["running", "running"]


def test_start_failure_stops_already_started_processes(
    services: Services,
    manager: ProcessManager,
    profiles: ProfileRepository,
    auth_headers: dict[str, str],
) -> None:
    with client_for(services) as client:
        client.post(
            "/api/profiles",
            json=body(
                [
                    {"id": "a", "argv": SLEEPER},
                    {"id": "b", "argv": ["/definitely/not/a/command"]},
                ]
            ),
            headers=auth_headers,
        )
        response = client.post("/api/profiles/sim/start", headers=auth_headers)

        assert response.status_code == 409
        assert response.json()["code"] == "profile_start_failed"
        assert manager.get("a").state == "exited"
        assert manager.get("b").state == "failed"
