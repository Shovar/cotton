from __future__ import annotations

from fastapi.testclient import TestClient

from cotton.api.routes_graph import create_router, graph_channel
from cotton.app import create_app
from cotton.ros.models import GraphSnapshot, NodeInfo, TopicInfo
from cotton.services import Services

TOKEN = "test-token"
ORIGIN = "http://testserver"


class StubWatcher:
    def __init__(
        self,
        snapshot: GraphSnapshot | None,
        status: dict[str, object] | None = None,
    ) -> None:
        self._snapshot = snapshot
        self._status = status or {"connected": False, "error": None}

    def current(self) -> GraphSnapshot | None:
        return self._snapshot

    def current_status(self) -> dict[str, object]:
        return self._status


def app_for(services: Services, watcher: StubWatcher) -> TestClient:
    services.routers.append(create_router(watcher))  # type: ignore[arg-type]
    services.channels.register(graph_channel(watcher))  # type: ignore[arg-type]
    return TestClient(create_app(services))


def graph_snapshot() -> GraphSnapshot:
    return GraphSnapshot(
        nodes=[
            NodeInfo(
                name="/talker",
                namespace="/",
                publishers=["/chatter"],
                subscribers=[],
                services=["/talker/get_parameters"],
                actions=[],
            )
        ],
        topics=[
            TopicInfo(
                name="/chatter",
                types=["std_msgs/msg/String"],
                publishers=["/talker"],
                subscribers=[],
            )
        ],
        services={"/talker/get_parameters": ["rcl_interfaces/srv/GetParameters"]},
        actions={},
        revision=4,
    )


def test_graph_endpoint_returns_empty_snapshot_before_first_poll(
    services: Services, auth_headers: dict[str, str]
) -> None:
    response = app_for(services, StubWatcher(None)).get("/api/graph", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {
        "nodes": [],
        "topics": [],
        "services": {},
        "actions": {},
        "revision": 0,
    }


def test_graph_endpoint_returns_current_snapshot(
    services: Services, auth_headers: dict[str, str]
) -> None:
    response = app_for(services, StubWatcher(graph_snapshot())).get(
        "/api/graph", headers=auth_headers
    )

    assert response.status_code == 200
    assert response.json()["nodes"][0]["name"] == "/talker"
    assert response.json()["topics"][0]["publishers"] == ["/talker"]
    assert response.json()["revision"] == 4


def test_graph_endpoint_requires_authentication(services: Services) -> None:
    response = app_for(services, StubWatcher(None)).get("/api/graph")

    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_graph_channel_sends_snapshot_then_status_on_subscribe(services: Services) -> None:
    client = app_for(services, StubWatcher(graph_snapshot(), {"connected": True, "error": None}))

    with client.websocket_connect(f"/ws?token={TOKEN}", headers={"origin": ORIGIN}) as websocket:
        websocket.send_json({"type": "subscribe", "channels": ["graph"]})
        snapshot = websocket.receive_json()
        status = websocket.receive_json()

    assert snapshot == {"type": "graph.update", "data": graph_snapshot().to_dict()}
    assert status == {"type": "ros.status", "data": {"connected": True, "error": None}}


def test_graph_channel_sends_status_when_no_snapshot_exists(services: Services) -> None:
    client = app_for(services, StubWatcher(None))

    with client.websocket_connect(f"/ws?token={TOKEN}", headers={"origin": ORIGIN}) as websocket:
        websocket.send_json({"type": "subscribe", "channels": ["graph"]})
        status = websocket.receive_json()

    assert status == {"type": "ros.status", "data": {"connected": False, "error": None}}
