from __future__ import annotations

import asyncio
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest
import yaml

from cotton.events import EventBus
from cotton.plugins.loader import PluginLoader
from cotton.plugins.manager import (
    Healthcheck,
    HealthcheckError,
    PluginError,
    PluginManager,
    check_health,
)
from cotton.plugins.settings import SettingsRepository
from cotton.storage.db import Database

ACTIVE_KEY = "plugins.active"


def write_plugin(root: Path, name: str, **overrides: object) -> None:
    data: dict[str, object] = {"name": name, "version": "0.1.0"}
    data.update(overrides)
    directory = root / name
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "plugin.yaml").write_text(yaml.safe_dump(data), encoding="utf-8")


async def ok_healthcheck(_check: Healthcheck) -> None:
    return None


def build_manager(
    tmp_path: Path,
    db: Database,
    healthcheck: object = ok_healthcheck,
) -> PluginManager:
    loader = PluginLoader(tmp_path / "builtin", tmp_path / "user")
    return PluginManager(
        loader,
        SettingsRepository(db),
        EventBus(),
        healthcheck=healthcheck,  # type: ignore[arg-type]
    )


def find(manager: PluginManager, name: str) -> object:
    return next(record for record in manager.all() if record.name == name)


async def test_activation_activates_dependencies_first(tmp_path: Path) -> None:
    write_plugin(tmp_path / "builtin", "base")
    write_plugin(tmp_path / "builtin", "app", requires=["base"])
    db = Database(tmp_path / "state.db")
    db.migrate()
    manager = build_manager(tmp_path, db)
    settings = SettingsRepository(db)

    record = await manager.activate("app")

    assert record.state == "active"
    assert find(manager, "base").state == "active"  # type: ignore[attr-defined]
    assert settings.get(ACTIVE_KEY) == ["base", "app"]
    db.close()


async def test_failed_healthcheck_rolls_back_and_leaves_error(tmp_path: Path) -> None:
    write_plugin(
        tmp_path / "builtin",
        "demo",
        healthcheck={"url": "tcp://127.0.0.1:9", "retries": 1, "delay_s": 0.0},
    )
    db = Database(tmp_path / "state.db")
    db.migrate()

    async def failing(_check: Healthcheck) -> None:
        raise HealthcheckError("bridge never came up")

    manager = build_manager(tmp_path, db, failing)

    with pytest.raises(PluginError, match="bridge never came up"):
        await manager.activate("demo")

    record = manager.all()[0]
    assert record.state == "error"
    assert record.error == "bridge never came up"
    assert SettingsRepository(db).get(ACTIVE_KEY) == []
    db.close()


async def test_activation_is_persisted_and_restored(tmp_path: Path) -> None:
    write_plugin(tmp_path / "builtin", "demo")
    db = Database(tmp_path / "state.db")
    db.migrate()
    await build_manager(tmp_path, db).activate("demo")

    restored = build_manager(tmp_path, db)
    await restored.restore()

    assert find(restored, "demo").state == "active"  # type: ignore[attr-defined]
    db.close()


async def test_deactivate_clears_persistence(tmp_path: Path) -> None:
    write_plugin(tmp_path / "builtin", "demo")
    db = Database(tmp_path / "state.db")
    db.migrate()
    manager = build_manager(tmp_path, db)
    await manager.activate("demo")

    record = await manager.deactivate("demo")

    assert record.state == "stopped"
    assert SettingsRepository(db).get(ACTIVE_KEY) == []
    db.close()


async def test_shutdown_keeps_the_active_list(tmp_path: Path) -> None:
    write_plugin(tmp_path / "builtin", "demo")
    db = Database(tmp_path / "state.db")
    db.migrate()
    manager = build_manager(tmp_path, db)
    await manager.activate("demo")

    await manager.shutdown()

    assert find(manager, "demo").state == "stopped"  # type: ignore[attr-defined]
    assert SettingsRepository(db).get(ACTIVE_KEY) == ["demo"]
    db.close()


async def test_dependency_cycle_is_rejected(tmp_path: Path) -> None:
    write_plugin(tmp_path / "builtin", "a", requires=["b"])
    write_plugin(tmp_path / "builtin", "b", requires=["a"])
    db = Database(tmp_path / "state.db")
    db.migrate()
    manager = build_manager(tmp_path, db)

    with pytest.raises(PluginError, match="cycle"):
        await manager.activate("a")

    db.close()


async def test_tcp_healthcheck_uses_a_real_socket() -> None:
    async def close(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        writer.close()
        await writer.wait_closed()

    server = await asyncio.start_server(close, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    try:
        await check_health(
            Healthcheck(url=f"tcp://127.0.0.1:{port}", timeout_s=1.0, retries=1, delay_s=0.0)
        )
    finally:
        server.close()
        await server.wait_closed()


class OkHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, format: str, *args: object) -> None:
        pass


async def test_http_healthcheck_hits_a_local_server() -> None:
    server = HTTPServer(("127.0.0.1", 0), OkHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        await check_health(
            Healthcheck(
                url=f"http://127.0.0.1:{server.server_port}/ok",
                timeout_s=1.0,
                retries=1,
                delay_s=0.0,
            )
        )
    finally:
        server.shutdown()
        thread.join()


async def test_healthcheck_fails_after_retries() -> None:
    with pytest.raises(HealthcheckError, match="healthcheck failed"):
        await check_health(
            Healthcheck(url="tcp://127.0.0.1:9", timeout_s=0.1, retries=1, delay_s=0.0)
        )
