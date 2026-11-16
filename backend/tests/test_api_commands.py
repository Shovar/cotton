from __future__ import annotations

import os
from pathlib import Path

from fastapi.testclient import TestClient

from ros_studio.api import routes_commands
from ros_studio.app import create_app
from ros_studio.services import Services


def executable(path: Path) -> None:
    path.write_text("#!/bin/sh\n")
    path.chmod(0o755)


def test_lists_sorted_executables_from_path(
    services: Services,
    auth_headers: dict[str, str],
    tmp_path: Path,
    monkeypatch,
) -> None:
    first = tmp_path / "first"
    second = tmp_path / "second"
    first.mkdir()
    second.mkdir()
    executable(first / "ros2")
    executable(first / "duplicate")
    executable(second / "duplicate")
    (second / "README").write_text("not executable")
    (second / "folder").mkdir()
    monkeypatch.setenv(
        "PATH",
        os.pathsep.join([str(first), str(tmp_path / "missing"), str(second)]),
    )
    services.routers.append(routes_commands.router)

    with TestClient(create_app(services)) as client:
        response = client.get("/api/commands", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == ["duplicate", "ros2"]


def test_commands_require_auth(
    services: Services,
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("PATH", str(tmp_path))
    services.routers.append(routes_commands.router)

    with TestClient(create_app(services)) as client:
        response = client.get("/api/commands")

    assert response.status_code == 401
