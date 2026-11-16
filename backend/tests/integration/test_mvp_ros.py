from __future__ import annotations

import os
import shutil
import subprocess
import time
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import TypeVar

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration
pytest.importorskip("rclpy")

from cotton.api import routes_graph, routes_processes, routes_topics  # noqa: E402
from cotton.app import Services, create_app  # noqa: E402
from cotton.env import ensure_ros_environment  # noqa: E402
from cotton.events import EventBus  # noqa: E402
from cotton.processes.manager import ProcessManager  # noqa: E402
from cotton.ros.graph import ThreadGraphSource  # noqa: E402
from cotton.ros.rate import ThreadRateSource  # noqa: E402
from cotton.ros.thread import RosThread  # noqa: E402
from cotton.ros.watcher import GraphWatcher  # noqa: E402
from cotton.security import Auth  # noqa: E402
from cotton.storage.db import Database  # noqa: E402
from cotton.storage.process_registry import ProcessRegistry  # noqa: E402

TOKEN = "integration-token"
ORIGIN = "http://testserver"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

T = TypeVar("T")


def wait_until(predicate: Callable[[], T], timeout: float = 15.0) -> T:
    """Poll ``predicate`` until it returns something truthy or the timeout expires."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = predicate()
        if result:
            return result
        time.sleep(0.25)
    raise AssertionError(f"condition not met within {timeout}s")


@pytest.fixture
def ros_client(tmp_path: Path) -> Iterator[TestClient]:
    db = Database(tmp_path / "state.db")
    bus = EventBus()
    ros = RosThread(poll_interval=0.05)
    services = Services(
        env=ensure_ros_environment(),
        ros=ros,
        bus=bus,
        auth=Auth(TOKEN, {ORIGIN}),
        db=db,
    )
    watcher = GraphWatcher(ros, ThreadGraphSource(ros), bus, interval=0.25)
    services.routers.append(routes_graph.create_router(watcher))
    services.routers.append(routes_topics.create_router(ros, ThreadRateSource(ros)))
    manager = ProcessManager(bus, tmp_path / "logs", registry=ProcessRegistry(db))
    services.routers.append(routes_processes.create_router(manager))
    services.startup.append(watcher.start)
    services.startup.append(manager.recover)
    services.shutdown.append(manager.shutdown)
    services.shutdown.append(watcher.stop)
    with TestClient(create_app(services)) as client:
        yield client


def _graph(client: TestClient) -> dict[str, object]:
    response = client.get("/api/graph", headers=HEADERS)
    assert response.status_code == 200
    return response.json()


def _node_names(client: TestClient) -> set[str]:
    nodes = _graph(client)["nodes"]
    assert isinstance(nodes, list)
    return {node["name"] for node in nodes if not node["name"].startswith("/cotton")}


def _topic_names(client: TestClient) -> set[str]:
    topics = _graph(client)["topics"]
    assert isinstance(topics, list)
    return {topic["name"] for topic in topics}


def _cli_names(*args: str) -> set[str]:
    output = subprocess.check_output(["ros2", *args], text=True)
    return {line.strip() for line in output.splitlines() if line.strip()}


def _without_our_own(names: set[str]) -> set[str]:
    return {name for name in names if not name.startswith(("/cotton", "/_ros2cli_daemon"))}


@pytest.mark.skipif(
    not os.environ.get("ROS_DISTRO") or shutil.which("ros2") is None,
    reason="ROS 2 environment is not active",
)
def test_graph_matches_the_ros_cli_and_measures_pose(ros_client: TestClient) -> None:
    started = ros_client.post(
        "/api/processes",
        json={"command": "ros2 run turtlesim turtlesim_node"},
        headers=HEADERS,
    )
    assert started.status_code == 201

    try:
        wait_until(lambda: "/turtlesim" in _node_names(ros_client))
        wait_until(lambda: "/turtle1/pose" in _topic_names(ros_client))

        api_nodes = _without_our_own(_node_names(ros_client))
        cli_nodes = _without_our_own(_cli_names("node", "list"))
        assert api_nodes == cli_nodes

        assert _topic_names(ros_client) == _without_our_own(
            _cli_names("topic", "list", "--include-hidden-topics")
        )

        def measured() -> dict[str, object]:
            response = ros_client.get(
                "/api/topics//turtle1/pose/rate",
                params={"window_s": 2},
                headers=HEADERS,
            )
            assert response.status_code == 200
            return response.json()

        def publishes() -> dict[str, object] | None:
            result = measured()
            return result if result["available"] and result["hz"] else None

        rate = wait_until(publishes)
        assert rate["hz"] > 0
        assert rate["window_s"] == 2
    finally:
        stopped = ros_client.delete(f"/api/processes/{started.json()['id']}", headers=HEADERS)
        assert stopped.status_code == 200
