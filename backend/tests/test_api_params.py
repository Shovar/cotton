from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from ros_studio.api.routes_params import create_router
from ros_studio.app import create_app
from ros_studio.ros.thread import RosCallError
from ros_studio.services import Services


class StubParams:
    def __init__(
        self, values: dict[str, Any] | None = None, error: Exception | None = None
    ) -> None:
        self.values = values or {}
        self.error = error
        self.written: list[tuple[str, str, Any]] = []

    def get_all(self, node_name: str, timeout: float = 5.0) -> dict[str, Any]:
        if self.error is not None:
            raise self.error
        return self.values

    def set(self, node_name: str, name: str, value: Any, timeout: float = 5.0) -> None:
        if self.error is not None:
            raise self.error
        self.written.append((node_name, name, value))


def client_for(services: Services, params: StubParams) -> TestClient:
    services.routers.append(create_router(services.ros, params))
    return TestClient(create_app(services))


def test_read_params_returns_values(services: Services, auth_headers: dict[str, str]) -> None:
    with client_for(services, StubParams({"speed": 1.5})) as client:
        response = client.get("/api/nodes/%2Ftalker/params", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {"speed": 1.5}


def test_read_params_of_unknown_node_is_not_found(
    services: Services, auth_headers: dict[str, str]
) -> None:
    params = StubParams(error=RosCallError("node /ghost is not available", code="node_not_found"))

    with client_for(services, params) as client:
        response = client.get("/api/nodes/%2Fghost/params", headers=auth_headers)

    assert response.status_code == 404
    assert response.json()["code"] == "node_not_found"


def test_read_params_rejects_relative_node_name(
    services: Services, auth_headers: dict[str, str]
) -> None:
    with client_for(services, StubParams()) as client:
        response = client.get("/api/nodes/talker/params", headers=auth_headers)

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_write_param_returns_no_content_and_forwards_value(
    services: Services, auth_headers: dict[str, str]
) -> None:
    params = StubParams()

    with client_for(services, params) as client:
        response = client.put(
            "/api/nodes/%2Ftalker/params/speed", json={"value": 2}, headers=auth_headers
        )

    assert response.status_code == 204
    assert params.written == [("/talker", "speed", 2)]


def test_write_read_only_param_is_conflict(
    services: Services, auth_headers: dict[str, str]
) -> None:
    params = StubParams(error=RosCallError("speed is read-only", code="param_not_settable"))

    with client_for(services, params) as client:
        response = client.put(
            "/api/nodes/%2Ftalker/params/speed", json={"value": 2}, headers=auth_headers
        )

    assert response.status_code == 409
    assert response.json()["code"] == "param_not_settable"


def test_write_param_rejects_wrong_type(services: Services, auth_headers: dict[str, str]) -> None:
    params = StubParams(error=ValueError("expected integer, got 2.5"))

    with client_for(services, params) as client:
        response = client.put(
            "/api/nodes/%2Ftalker/params/speed", json={"value": 2.5}, headers=auth_headers
        )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_write_param_requires_value(services: Services, auth_headers: dict[str, str]) -> None:
    with client_for(services, StubParams()) as client:
        response = client.put("/api/nodes/%2Ftalker/params/speed", json={}, headers=auth_headers)

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_params_require_authentication(services: Services) -> None:
    with client_for(services, StubParams()) as client:
        response = client.get("/api/nodes/%2Ftalker/params")

    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"
