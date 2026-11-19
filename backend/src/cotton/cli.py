from __future__ import annotations

import argparse
import logging
import sys
import threading
import webbrowser
from pathlib import Path

import uvicorn
from platformdirs import user_cache_dir, user_config_dir

from cotton.api import (
    routes_commands,
    routes_graph,
    routes_params,
    routes_plugins,
    routes_terminal_groups,
    routes_terminals,
    routes_topics,
    routes_workspace_commands,
    routes_workspaces,
)
from cotton.app import create_app
from cotton.channels import ChannelRegistry
from cotton.env import EnvironmentInfo, RosEnvironmentError, ensure_ros_environment
from cotton.events import EventBus
from cotton.plugins.assets import AssetError, LichtblickAssets
from cotton.plugins.loader import BUILTIN_PLUGINS_DIR, PluginLoader
from cotton.plugins.manager import PluginManager
from cotton.plugins.settings import SettingsRepository
from cotton.ros.graph import ThreadGraphSource
from cotton.ros.params import ThreadParamsSource
from cotton.ros.rate import ThreadRateSource
from cotton.ros.thread import RosThread
from cotton.ros.watcher import GraphWatcher
from cotton.security import Auth, generate_token
from cotton.services import Services
from cotton.storage.db import Database
from cotton.terminals.manager import TerminalManager
from cotton.terminals.posix import PosixPtySpawner
from cotton.workspaces.commands import SqliteCommandRepository
from cotton.workspaces.repository import SqliteWorkspaceRepository


def allowed_origins(port: int, extra: list[str] | None = None) -> set[str]:
    origins = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
    origins.update(extra or [])
    return origins


def browser_url(host: str, port: int, token: str) -> str:
    display_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
    return f"http://{display_host}:{port}/#token={token}"


def build_services(
    env: EnvironmentInfo, token: str, origins: set[str], db_path: Path | None = None
) -> Services:
    web_dir = Path(__file__).parent / "web"
    database = Database(db_path or Path(user_config_dir("cotton")) / "state.db")
    ros = RosThread()
    bus = EventBus()
    services = Services(
        env=env,
        ros=ros,
        bus=bus,
        auth=Auth(token, origins),
        db=database,
        channels=ChannelRegistry(),
        spa_dir=web_dir if web_dir.is_dir() else None,
    )
    watcher = GraphWatcher(ros, ThreadGraphSource(ros), bus)
    services.routers.append(routes_commands.router)
    services.routers.append(routes_graph.create_router(watcher))
    services.channels.register(routes_graph.graph_channel(watcher))
    services.routers.append(routes_params.create_router(ros, ThreadParamsSource(ros)))
    services.routers.append(routes_topics.create_router(ros, ThreadRateSource(ros)))

    workspaces = SqliteWorkspaceRepository(database)
    terminal_manager = TerminalManager(bus, PosixPtySpawner())
    services.terminal_manager = terminal_manager
    commands = SqliteCommandRepository(database)
    services.routers.append(routes_terminals.create_router(terminal_manager, workspaces, commands))
    services.routers.append(routes_workspaces.create_router(workspaces, terminal_manager))
    services.routers.append(routes_terminal_groups.create_router(workspaces, terminal_manager))
    services.routers.append(
        routes_workspace_commands.create_router(workspaces, commands, terminal_manager)
    )
    routes_terminals.register_terminal_channels(services.channels, terminal_manager)
    services.shutdown.append(terminal_manager.shutdown)

    plugins = PluginManager(
        PluginLoader(BUILTIN_PLUGINS_DIR, Path(user_config_dir("cotton")) / "plugins"),
        SettingsRepository(database),
        bus,
    )
    services.routers.append(routes_plugins.create_router(plugins))
    routes_plugins.register_plugin_channel(services.channels, plugins)
    viewer_assets = LichtblickAssets(Path(user_cache_dir("cotton")) / "lichtblick")
    services.viewer_dir = viewer_assets.path

    async def prepare_viewer() -> None:
        try:
            await viewer_assets.ensure()
        except AssetError as exc:
            logging.getLogger(__name__).warning("Lichtblick assets unavailable: %s", exc)

    services.startup.append(plugins.restore)
    services.startup.append(prepare_viewer)
    services.shutdown.append(plugins.shutdown)
    services.startup.append(watcher.start)
    services.shutdown.append(watcher.stop)
    return services


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="cotton", description="Local web control panel for ROS 2")
    parser.add_argument("--host", default="127.0.0.1", help="bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="bind port (default: 8000)")
    parser.add_argument(
        "--no-browser", action="store_true", help="do not open a browser on startup"
    )
    parser.add_argument(
        "--token",
        default=None,
        help="fixed session token for automation (insecure; do not use interactively)",
    )
    parser.add_argument(
        "--allow-origin",
        action="append",
        default=None,
        help="extra allowed CORS/WebSocket origin (repeatable)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        env = ensure_ros_environment()
    except RosEnvironmentError as exc:
        print(f"cotton: {exc}", file=sys.stderr)
        return 2

    token = args.token or generate_token()
    services = build_services(env, token, allowed_origins(args.port, args.allow_origin))
    if not args.no_browser:
        url = browser_url(args.host, args.port, token)
        timer = threading.Timer(1.0, webbrowser.open, args=(url,))
        timer.daemon = True
        timer.start()
    uvicorn.run(create_app(services), host=args.host, port=args.port, access_log=False)
    return 0
