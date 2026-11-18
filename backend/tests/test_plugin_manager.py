from __future__ import annotations

import asyncio
import threading
from datetime import datetime, timezone
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
from cotton.processes.models import ProcessRecord, ProcessSpec
from cotton.storage.db import Database

ACTIVE_KEY = "plugins.active"


def write_plugin(root: Path, name: str, **overrides: object) -> None:
    data: dict[str, object] = {
        "name": name,
        "version": "0.1.0",
        "processes": [{"id": "bridge", "argv": ["sleep", "1"]}],
    }
    data.update(overrides)
    directory = root / name
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "plugin.yaml").write_text(yaml.safe_dump(data), encoding="utf-8")


class FakeProcesses:
    def __init__(self) -> None:
        self.started: list[ProcessSpec] = []
        self.stopped: list[str] = []

    async def start(self, spec: ProcessSpec) -> ProcessRecord:
        self.started.append(spec)
        return _record(spec)

    async def stop(self, process_id: str) -> ProcessRecord:
        self.stopped.append(process_id)
        return _record(ProcessSpec(id=process_id, argv=["sleep", "1"]))


def _record(spec: ProcessSpec) -> ProcessRecord:
    return ProcessRecord(
        id=spec.id,
        spec=spec,
        state="running",
        pid=4242,
        pgid=4242,
        started_at=datetime.now(timezone.utc),
    )


async def ok_healthcheck(_check: Healthcheck) -> None:
    return None


def build_manager(
    tmp_path: Path,
    db: Database,
    processes: FakeProcesses | None = None,
    healthcheck: object = ok_healthcheck,
) -> PluginManager:
    loader = PluginLoader(tmp_path / "builtin", tmp_path / "user")
    return PluginManager(
        loader,
        SettingsRepository(db),
        processes or FakeProcesses(),
        EventBus(),
        healthcheck=healthcheck,  # type: ignore[arg-type]
    )


def find(manager: PluginManager, name: str) -> object:
    return next(record for record in manager.all() if record.name == name)


async def test_activation_starts_dependencies_first(tmp_path: Path) -> None:
    write_plugin(tmp_path / "builtin", "base")
    write_plugin(tmp_path / "builtin", "app", requires=["base"])
    db = Database(tmp_path / "state.db")
    db.migrate()
    processes = FakeProcesses()
    manager = build_manager(tmp_path, db, processes)
    settings = SettingsRepository(db)

    record = await manager.activate("app")

    assert record.state == "active"
    assert [spec.id for spec in processes.started] == ["base.bridge", "app.bridge"]
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
    processes = FakeProcesses()

    async def failing(_check: Healthcheck) -> None:
        raise HealthcheckError("bridge never came up")

    manager = build_manager(tmp_path, db, processes, failing)

    with pytest.raises(PluginError, match="bridge never came up"):
        await manager.activate("demo")

    assert processes.stopped == ["demo.bridge"]
    record = manager.all()[0]
    assert record.state == "error"
    assert record.error == "bridge never came up"
    assert SettingsRepository(db).get(ACTIVE_KEY) == []
    db.close()


async def test_activation_is_persisted_and_restored(tmp_path: Path) -> None:
    write_plugin(tmp_path / "builtin", "demo")
    db = Database(tmp_path / "state.db")
    db.migrate()
    first = FakeProcesses()
    await build_manager(tmp_path, db, first).activate("demo")

    second = FakeProcesses()
    restored = build_manager(tmp_path, db, second)
    await restored.restore()

    assert [spec.id for spec in second.started] == ["demo.bridge"]
    assert find(restored, "demo").state == "active"  # type: ignore[attr-defined]
    db.close()


async def test_deactivate_stops_processes_and_clears_persistence(tmp_path: Path) -> None:
    write_plugin(tmp_path / "builtin", "demo")
    db = Database(tmp_path / "state.db")
    db.migrate()
    processes = FakeProcesses()
    manager = build_manager(tmp_path, db, processes)
    await manager.activate("demo")

    record = await manager.deactivate("demo")

    assert record.state == "stopped"
    assert processes.stopped == ["demo.bridge"]
    assert SettingsRepository(db).get(ACTIVE_KEY) == []
    db.close()


async def test_shutdown_stops_processes_but_keeps_the_active_list(tmp_path: Path) -> None:
    write_plugin(tmp_path / "builtin", "demo")
    db = Database(tmp_path / "state.db")
    db.migrate()
    processes = FakeProcesses()
    manager = build_manager(tmp_path, db, processes)
    await manager.activate("demo")

    await manager.shutdown()

    assert processes.stopped == ["demo.bridge"]
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
