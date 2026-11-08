from fastapi.testclient import TestClient

from ros_studio.app import create_app
from ros_studio.env import RosEnvironmentError
from ros_studio.errors import ApiError
from ros_studio.services import Services


def test_env_endpoint(client: TestClient, auth_headers: dict[str, str]) -> None:
    response = client.get("/api/env", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["distro"] == "jazzy"
    assert body["domain_id"] == 0
    assert body["rmw"] is None
    assert body["workspace"] == "/ws"


def test_unknown_api_route_uses_error_envelope(client: TestClient) -> None:
    response = client.get("/api/unknown")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"
    assert "message" in response.json()


def test_api_error_uses_its_code_and_status(services: Services) -> None:
    app = create_app(services)

    @app.get("/boom")
    async def boom() -> None:
        raise ApiError(409, "process_conflict", "already running")

    response = TestClient(app).get("/boom")
    assert response.status_code == 409
    assert response.json() == {"code": "process_conflict", "message": "already running"}


def test_ros_environment_error_is_reported_without_stack_trace(services: Services) -> None:
    app = create_app(services)

    @app.get("/ros-down")
    async def ros_down() -> None:
        raise RosEnvironmentError("rclpy is not importable")

    response = TestClient(app).get("/ros-down")
    assert response.status_code == 500
    assert response.json()["code"] == "ros_environment_error"
