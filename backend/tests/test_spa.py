from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from ros_studio.app import mount_spa
from ros_studio.errors import install_error_handlers


def test_mount_spa_serves_index_and_falls_back(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<html>ok</html>")
    app = FastAPI()
    mount_spa(app, tmp_path)
    client = TestClient(app)

    assert client.get("/").status_code == 200
    assert client.get("/some/route").status_code == 200
    assert client.get("/api/unknown").status_code == 404
    assert client.get("/ws").status_code == 404


def test_mount_spa_serves_built_assets(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<html>ok</html>")
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("console.log('ok')")
    app = FastAPI()
    mount_spa(app, tmp_path)

    response = TestClient(app).get("/assets/app.js")

    assert response.status_code == 200
    assert "console.log" in response.text


def test_mount_spa_reports_missing_build() -> None:
    app = FastAPI()
    install_error_handlers(app)
    mount_spa(app, None)

    response = TestClient(app).get("/")

    assert response.status_code == 404
    assert response.json()["code"] == "frontend_not_built"
