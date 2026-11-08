from fastapi.testclient import TestClient

from ros_studio.app import create_app
from ros_studio.env import EnvironmentInfo, RosEnvironmentError
from ros_studio.errors import ApiError


def environment() -> EnvironmentInfo:
    return EnvironmentInfo(
        distro="jazzy",
        domain_id=0,
        rmw=None,
        workspace=None,
        ros_version="2",
        app_version="0.1.0",
    )


def test_env_endpoint() -> None:
    response = TestClient(create_app(environment())).get("/api/env")
    assert response.status_code == 200
    assert response.json()["distro"] == "jazzy"


def test_unknown_api_route_uses_error_envelope() -> None:
    response = TestClient(create_app(environment())).get("/api/unknown")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"
    assert "message" in response.json()


def test_api_error_uses_its_code_and_status() -> None:
    app = create_app(environment())

    @app.get("/boom")
    async def boom() -> None:
        raise ApiError(409, "process_conflict", "already running")

    response = TestClient(app).get("/boom")
    assert response.status_code == 409
    assert response.json() == {"code": "process_conflict", "message": "already running"}


def test_ros_environment_error_is_reported_without_stack_trace() -> None:
    app = create_app(environment())

    @app.get("/ros-down")
    async def ros_down() -> None:
        raise RosEnvironmentError("rclpy is not importable")

    response = TestClient(app).get("/ros-down")
    assert response.status_code == 500
    assert response.json()["code"] == "ros_environment_error"
