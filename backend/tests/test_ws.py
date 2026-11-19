from __future__ import annotations

from fastapi.testclient import TestClient

from cotton.app import Services, create_app
from cotton.channels import Channel
from cotton.events import Event

TOKEN = "test-token"
ORIGIN = "http://testserver"


def websocket_url() -> str:
    return f"/ws?token={TOKEN}"


def test_ws_sends_initial_channel_events(services: Services) -> None:
    async def initial() -> list[Event]:
        return [Event("test.snapshot", {"revision": 0})]

    services.channels.register(Channel("snapshot", matches=lambda event: False, initial=initial))
    app = create_app(services)
    with TestClient(app).websocket_connect(
        websocket_url(), headers={"origin": ORIGIN}
    ) as websocket:
        websocket.send_json({"type": "subscribe", "channels": ["snapshot"]})
        assert websocket.receive_json() == {
            "type": "test.snapshot",
            "data": {"revision": 0},
        }


def test_ws_forwards_bus_events_on_subscribed_channel(services: Services) -> None:
    app = create_app(services)
    with TestClient(app).websocket_connect(
        websocket_url(), headers={"origin": ORIGIN}
    ) as websocket:
        websocket.send_json({"type": "subscribe", "channels": ["test"]})
        assert websocket.receive_json() == {
            "type": "test.event",
            "data": {"hello": "world"},
        }


def test_ws_rejects_unknown_channels(services: Services) -> None:
    app = create_app(services)
    with TestClient(app).websocket_connect(
        websocket_url(), headers={"origin": ORIGIN}
    ) as websocket:
        websocket.send_json({"type": "subscribe", "channels": ["nope"]})
        message = websocket.receive_json()
        assert message["type"] == "error"
        assert message["data"]["code"] == "unknown_channel"


def test_ws_reports_unsupported_messages(services: Services) -> None:
    app = create_app(services)
    with TestClient(app).websocket_connect(
        websocket_url(), headers={"origin": ORIGIN}
    ) as websocket:
        websocket.send_json({"type": "nonsense"})
        message = websocket.receive_json()
        assert message["data"]["code"] == "unsupported_message"


def test_lifespan_starts_and_stops_ros(services: Services) -> None:
    ros = services.ros
    with TestClient(create_app(services)):
        assert ros.is_running
    assert not ros.is_running
    assert ros.stopped


def test_lifespan_runs_startup_and_shutdown_hooks(services: Services) -> None:
    calls: list[str] = []

    async def on_start() -> None:
        calls.append("start")

    async def on_stop() -> None:
        calls.append("stop")

    services.startup.append(on_start)
    services.shutdown.append(on_stop)
    with TestClient(create_app(services)):
        assert calls == ["start"]
    assert calls == ["start", "stop"]
