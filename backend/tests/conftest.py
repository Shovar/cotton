from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from ros_studio.app import Services, create_app
from ros_studio.channels import Channel, ChannelRegistry
from ros_studio.env import EnvironmentInfo
from ros_studio.events import Event, EventBus
from ros_studio.ros.thread import RosThread
from ros_studio.security import Auth

TOKEN = "test-token"
ORIGIN = "http://testserver"


class NoopRos(RosThread):
    def __init__(self) -> None:
        super().__init__(poll_interval=0.01)
        self.started = False
        self.stopped = False

    def _setup(self) -> None:
        self.node = object()
        self.started = True

    def _spin_once(self, timeout: float) -> None:
        pass

    def _teardown(self) -> None:
        self.stopped = True


def test_channel(bus: EventBus) -> Channel:
    async def trigger() -> list[Event]:
        await bus.publish("test.event", {"hello": "world"})
        return []

    return Channel("test", matches=lambda event: event.type == "test.event", initial=trigger)


@pytest.fixture
def env_info() -> EnvironmentInfo:
    return EnvironmentInfo(
        distro="jazzy",
        domain_id=0,
        rmw=None,
        workspace="/ws",
        ros_version="2",
        app_version="0.1.0",
    )


@pytest.fixture
def bus() -> EventBus:
    return EventBus()


@pytest.fixture
def services(env_info: EnvironmentInfo, bus: EventBus) -> Services:
    channels = ChannelRegistry()
    channels.register(test_channel(bus))
    return Services(
        env=env_info,
        ros=NoopRos(),
        bus=bus,
        auth=Auth(TOKEN, {ORIGIN}),
        channels=channels,
    )


@pytest.fixture
def client(services: Services) -> Iterator[TestClient]:
    with TestClient(create_app(services)) as http_client:
        yield http_client


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}
