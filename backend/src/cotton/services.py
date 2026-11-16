from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import APIRouter

from cotton.channels import ChannelRegistry
from cotton.env import EnvironmentInfo
from cotton.events import EventBus
from cotton.ros.thread import RosThread
from cotton.security import Auth
from cotton.storage.db import Database

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
