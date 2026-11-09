from __future__ import annotations

import argparse
import sys
import threading
import webbrowser
from pathlib import Path

import uvicorn
from platformdirs import user_config_dir

from ros_studio.app import create_app
from ros_studio.channels import ChannelRegistry
from ros_studio.env import EnvironmentInfo, RosEnvironmentError, ensure_ros_environment
from ros_studio.events import EventBus
from ros_studio.processes.manager import ProcessManager
from ros_studio.ros.thread import RosThread
from ros_studio.security import Auth, generate_token
from ros_studio.services import Services
from ros_studio.storage.db import Database
from ros_studio.storage.process_registry import ProcessRegistry


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
    config_dir = Path(user_config_dir("ros-studio"))
    database = Database(db_path or config_dir / "state.db")
    bus = EventBus()
    processes = ProcessManager(
        bus=bus,
        logs_dir=(Path(db_path).parent if db_path else config_dir) / "logs",
        registry=ProcessRegistry(database),
    )

    async def recover_processes() -> None:
        await processes.recover()

    return Services(
        env=env,
        ros=RosThread(),
        bus=bus,
        auth=Auth(token, origins),
        db=database,
        channels=ChannelRegistry(),
        spa_dir=web_dir if web_dir.is_dir() else None,
        startup=[recover_processes],
        shutdown=[processes.shutdown],
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="ros-studio", description="Local web control panel for ROS 2"
    )
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
        print(f"ros-studio: {exc}", file=sys.stderr)
        return 2

    token = args.token or generate_token()
    services = build_services(env, token, allowed_origins(args.port, args.allow_origin))
    if not args.no_browser:
        url = browser_url(args.host, args.port, token)
        timer = threading.Timer(1.0, webbrowser.open, args=(url,))
        timer.daemon = True
        timer.start()
    uvicorn.run(create_app(services), host=args.host, port=args.port)
    return 0
