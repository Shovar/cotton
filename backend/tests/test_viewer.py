from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ros_studio.app import mount_spa, mount_viewer


def test_mount_viewer_serves_the_bundle_and_layout(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<html>viewer</html>")
    (tmp_path / "layout.json").write_text('{"configById": {}}')
    app = FastAPI()
    mount_viewer(app, tmp_path)
    client = TestClient(app)

    assert client.get("/lichtblick/index.html").text == "<html>viewer</html>"
    assert client.get("/lichtblick/layout.json").json() == {"configById": {}}


def test_mount_viewer_wins_over_the_spa_catch_all(tmp_path: Path) -> None:
    viewer = tmp_path / "viewer"
    viewer.mkdir()
    (viewer / "index.html").write_text("viewer")
    (viewer / "layout.json").write_text('{"configById": {}}')
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("spa")
    app = FastAPI()
    mount_viewer(app, viewer)
    mount_spa(app, web)
    client = TestClient(app)

    assert client.get("/lichtblick/layout.json").json() == {"configById": {}}
    assert client.get("/").text == "spa"


def test_mount_viewer_explains_missing_assets(tmp_path: Path) -> None:
    app = FastAPI()
    mount_viewer(app, tmp_path)
    client = TestClient(app)

    response = client.get("/lichtblick/index.html")

    assert response.status_code == 503
    assert "lichtblick-web.tar.gz" in response.text


def test_mount_viewer_is_skipped_without_a_directory() -> None:
    app = FastAPI()
    mount_viewer(app, None)
    mount_spa(app, None)

    assert TestClient(app).get("/lichtblick/index.html").status_code == 404
