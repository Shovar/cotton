from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from cotton.app import mount_spa
from cotton.errors import install_error_handlers


def test_mount_spa_serves_index_and_falls_back(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<html>ok</html>")
    app = FastAPI()
    mount_spa(app, tmp_path)
    client = TestClient(app)

    index = client.get("/")
    fallback = client.get("/some/route")

    assert index.status_code == 200
    assert fallback.status_code == 200
    assert client.get("/api/unknown").status_code == 404
    assert client.get("/ws").status_code == 404
    assert index.headers["cache-control"] == "no-store"
    assert fallback.headers["cache-control"] == "no-store"


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
    assert "immutable" in response.headers["cache-control"]
    assert "max-age=31536000" in response.headers["cache-control"]


def test_mount_spa_reports_missing_build() -> None:
    app = FastAPI()
    install_error_handlers(app)
    mount_spa(app, None)

    response = TestClient(app).get("/")

    assert response.status_code == 404
    assert response.json()["code"] == "frontend_not_built"
