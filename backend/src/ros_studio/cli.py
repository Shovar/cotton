from __future__ import annotations

import argparse
import sys

import uvicorn

from ros_studio.app import create_app
from ros_studio.env import RosEnvironmentError, ensure_ros_environment


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="ros-studio", description="Local web control panel for ROS 2"
    )
    parser.add_argument("--host", default="127.0.0.1", help="bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="bind port (default: 8000)")
    parser.add_argument(
        "--no-browser", action="store_true", help="do not open a browser on startup"
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        env = ensure_ros_environment()
    except RosEnvironmentError as exc:
        print(f"ros-studio: {exc}", file=sys.stderr)
        return 2
    uvicorn.run(create_app(env), host=args.host, port=args.port)
    return 0
