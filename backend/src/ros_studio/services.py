from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import APIRouter

from ros_studio.channels import ChannelRegistry
from ros_studio.env import EnvironmentInfo
from ros_studio.events import EventBus
from ros_studio.ros.thread import RosThread
from ros_studio.security import Auth
from ros_studio.storage.db import Database

LifecycleHook = Callable[[], Awaitable[None]]


@dataclass
class Services:
    """Everything the app and the feature modules wire together."""

    env: EnvironmentInfo
    ros: RosThread
    bus: EventBus
    auth: Auth
    db: Database
    channels: ChannelRegistry = field(default_factory=ChannelRegistry)
    routers: list[APIRouter] = field(default_factory=list)
    spa_dir: Path | None = None
    viewer_dir: Path | None = None
    startup: list[LifecycleHook] = field(default_factory=list)
    shutdown: list[LifecycleHook] = field(default_factory=list)
