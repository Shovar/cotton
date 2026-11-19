from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from cotton.api.routes_fs import create_router
from cotton.app import create_app
from cotton.services import Services


@pytest.fixture
def fs_client(services: Services, tmp_path: Path) -> TestClient:
    services.routers.append(create_router(tmp_path))
    return TestClient(create_app(services))


def test_lists_only_directories_sorted_for_the_requested_path(
    fs_client: TestClient, auth_headers: dict[str, str], tmp_path: Path
) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "colcon_ws").mkdir()
    (tmp_path / "readme.md").write_text("x")

    with fs_client:
        response = fs_client.get(
            "/api/folders", params={"path": str(tmp_path)}, headers=auth_headers
        )

    assert response.status_code == 200
    body = response.json()
    assert body["path"] == str(tmp_path.resolve())
    assert body["parent"] == str(tmp_path.resolve().parent)
    assert [folder["name"] for folder in body["folders"]] == ["colcon_ws", "src"]
    assert body["folders"][0]["path"] == str(tmp_path / "colcon_ws")


def test_defaults_to_the_home_directory(services: Services) -> None:
    services.routers.append(create_router())
    client = TestClient(create_app(services))
    assert Path.home().resolve().is_dir()
    with client:
        response = client.get("/api/folders", headers={"Authorization": "Bearer test-token"})

    assert response.status_code == 200
    assert response.json()["path"] == str(Path.home().resolve())


def test_the_filesystem_root_has_no_parent(
    fs_client: TestClient, auth_headers: dict[str, str]
) -> None:
    with fs_client:
        response = fs_client.get("/api/folders", params={"path": "/"}, headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["parent"] is None


def test_rejects_files_and_missing_paths(
    fs_client: TestClient, auth_headers: dict[str, str], tmp_path: Path
) -> None:
    file_path = tmp_path / "file.txt"
    file_path.write_text("x")

    with fs_client:
        as_file = fs_client.get(
            "/api/folders", params={"path": str(file_path)}, headers=auth_headers
        )
        missing = fs_client.get(
            "/api/folders", params={"path": str(tmp_path / "missing")}, headers=auth_headers
        )

    assert (as_file.status_code, as_file.json()["code"]) == (422, "validation_error")
    assert (missing.status_code, missing.json()["code"]) == (422, "validation_error")


def test_folders_require_a_token(fs_client: TestClient) -> None:
    with fs_client:
        response = fs_client.get("/api/folders")

    assert response.status_code == 401
