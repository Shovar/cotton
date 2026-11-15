from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace

from ros_studio.ros.graph import RclpyGraphSource, ThreadGraphSource
from ros_studio.ros.models import GraphSnapshot, NodeInfo, TopicInfo


@dataclass
class Endpoint:
    node_name: str
    node_namespace: str
    topic_type: str


class FakeNode:
    actions = [("/talker/fibonacci", ["action_tutorials_interfaces/action/Fibonacci"])]

    def get_node_names_and_namespaces(self) -> list[tuple[str, str]]:
        return [("talker", "/"), ("listener", "/"), ("ros_studio_1", "/")]

    def get_topic_names_and_types(self) -> list[tuple[str, list[str]]]:
        return [("/chatter", ["std_msgs/msg/String"])]

    def get_service_names_and_types(self) -> list[tuple[str, list[str]]]:
        return [
            ("/talker/get_parameters", ["rcl_interfaces/srv/GetParameters"]),
            ("/listener/describe_parameters", ["rcl_interfaces/srv/DescribeParameters"]),
        ]

    def get_action_names_and_types(self) -> list[tuple[str, list[str]]]:
        return self.actions

    def get_publishers_info_by_topic(self, _topic: str) -> list[Endpoint]:
        return [Endpoint("talker", "/", "std_msgs/msg/String")]

    def get_subscriptions_info_by_topic(self, _topic: str) -> list[Endpoint]:
        return [Endpoint("listener", "/", "std_msgs/msg/String")]


def test_snapshot_excludes_self_and_inverts_endpoints() -> None:
    graph = RclpyGraphSource(FakeNode(), self_node_name="/ros_studio_1").snapshot()

    assert [node.name for node in graph.nodes] == ["/listener", "/talker"]
    nodes = {node.name: node for node in graph.nodes}
    assert nodes["/talker"].publishers == ["/chatter"]
    assert nodes["/listener"].subscribers == ["/chatter"]
    assert graph.topics == [
        TopicInfo(
            name="/chatter",
            types=["std_msgs/msg/String"],
            publishers=["/talker"],
            subscribers=["/listener"],
        )
    ]
    assert graph.services["/talker/get_parameters"] == ["rcl_interfaces/srv/GetParameters"]


def test_self_node_is_removed_from_endpoints_services_and_actions() -> None:
    class OwnNode(FakeNode):
        def get_topic_names_and_types(self) -> list[tuple[str, list[str]]]:
            return [("/rosout", ["rcl_interfaces/msg/Log"])]

        def get_service_names_and_types(self) -> list[tuple[str, list[str]]]:
            return [
                ("/ros_studio_1/get_parameters", ["rcl_interfaces/srv/GetParameters"]),
                ("/talker/get_parameters", ["rcl_interfaces/srv/GetParameters"]),
            ]

        def get_publishers_info_by_topic(self, _topic: str) -> list[Endpoint]:
            return [
                Endpoint("ros_studio_1", "/", "rcl_interfaces/msg/Log"),
                Endpoint("talker", "/", "rcl_interfaces/msg/Log"),
            ]

        def get_subscriptions_info_by_topic(self, _topic: str) -> list[Endpoint]:
            return [Endpoint("ros_studio_1_rate", "/", "rcl_interfaces/msg/Log")]

    graph = RclpyGraphSource(OwnNode(), self_node_name="/ros_studio_1").snapshot()

    assert graph.topics[0].publishers == ["/talker"]
    assert graph.topics[0].subscribers == []
    assert "/ros_studio_1/get_parameters" not in graph.services
    assert "/talker/get_parameters" in graph.services


def test_topic_without_endpoints_is_listed() -> None:
    class EmptyNode(FakeNode):
        def get_publishers_info_by_topic(self, _topic: str) -> list[Endpoint]:
            return []

        def get_subscriptions_info_by_topic(self, _topic: str) -> list[Endpoint]:
            return []

    graph = RclpyGraphSource(EmptyNode(), self_node_name="/ros_studio_1").snapshot()

    assert graph.topics[0].publishers == []
    assert graph.topics[0].subscribers == []


def test_services_and_actions_belong_to_their_node() -> None:
    graph = RclpyGraphSource(FakeNode(), self_node_name="/ros_studio_1").snapshot()
    nodes = {node.name: node for node in graph.nodes}

    assert nodes["/talker"].services == ["/talker/get_parameters"]
    assert nodes["/listener"].services == ["/listener/describe_parameters"]
    assert nodes["/talker"].actions == ["/talker/fibonacci"]
    assert graph.actions == {"/talker/fibonacci": ["action_tutorials_interfaces/action/Fibonacci"]}


def test_node_without_actions_api_degrades() -> None:
    class NoActionsNode(FakeNode):
        get_action_names_and_types = None

    graph = RclpyGraphSource(NoActionsNode(), self_node_name="/ros_studio_1").snapshot()

    assert graph.actions == {}
    assert all(node.actions == [] for node in graph.nodes)


def test_snapshot_lists_are_sorted_and_revision_starts_at_zero() -> None:
    class UnorderedNode(FakeNode):
        def get_node_names_and_namespaces(self) -> list[tuple[str, str]]:
            return [("zeta", "/b"), ("alpha", "/a"), ("ros_studio_1", "/")]

        def get_topic_names_and_types(self) -> list[tuple[str, list[str]]]:
            return [
                ("/zeta", ["std_msgs/msg/String", "std_msgs/msg/Int32"]),
                ("/alpha", ["std_msgs/msg/String"]),
            ]

        def get_service_names_and_types(self) -> list[tuple[str, list[str]]]:
            return [("/zeta/set_parameters", ["b"]), ("/alpha/get_parameters", ["a"])]

        def get_action_names_and_types(self) -> list[tuple[str, list[str]]]:
            return []

        def get_publishers_info_by_topic(self, topic: str) -> list[Endpoint]:
            return [Endpoint("zeta", "/b", "x"), Endpoint("alpha", "/a", "x")]

        def get_subscriptions_info_by_topic(self, _topic: str) -> list[Endpoint]:
            return []

    graph = RclpyGraphSource(UnorderedNode(), self_node_name="/ros_studio_1").snapshot()

    assert [node.name for node in graph.nodes] == ["/a/alpha", "/b/zeta"]
    assert [topic.name for topic in graph.topics] == ["/alpha", "/zeta"]
    assert graph.topics[1].types == ["std_msgs/msg/Int32", "std_msgs/msg/String"]
    assert graph.topics[1].publishers == ["/a/alpha", "/b/zeta"]
    assert list(graph.services) == ["/alpha/get_parameters", "/zeta/set_parameters"]
    assert graph.revision == 0


def test_models_serialize_to_contract_shape() -> None:
    graph = GraphSnapshot(
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
        revision=3,
    )

    assert graph.to_dict() == {
        "nodes": [
            {
                "name": "/talker",
                "namespace": "/",
                "publishers": ["/chatter"],
                "subscribers": [],
                "services": ["/talker/get_parameters"],
                "actions": [],
            }
        ],
        "topics": [
            {
                "name": "/chatter",
                "types": ["std_msgs/msg/String"],
                "publishers": ["/talker"],
                "subscribers": [],
            }
        ],
        "services": {"/talker/get_parameters": ["rcl_interfaces/srv/GetParameters"]},
        "actions": {},
        "revision": 3,
    }


class CountingNode(FakeNode):
    def __init__(self) -> None:
        self.calls = 0
        self.publisher = "talker"
        self.types: dict[str, list[str]] = {"/chatter": ["std_msgs/msg/String"]}

    def get_topic_names_and_types(self) -> list[tuple[str, list[str]]]:
        return list(self.types.items())

    def get_publishers_info_by_topic(self, _topic: str) -> list[Endpoint]:
        self.calls += 1
        return [Endpoint(self.publisher, "/", "std_msgs/msg/String")]

    def get_subscriptions_info_by_topic(self, _topic: str) -> list[Endpoint]:
        return []


def test_cache_is_pruned_when_a_topic_disappears() -> None:
    node = CountingNode()
    source = RclpyGraphSource(node, self_node_name="/ros_studio_1")
    assert source.snapshot().topics[0].publishers == ["/talker"]

    node.types = {}
    source.snapshot()

    node.types = {"/chatter": ["std_msgs/msg/String"]}
    node.publisher = "talker2"
    assert source.snapshot().topics[0].publishers == ["/talker2"]


def test_endpoints_are_cached_until_the_topic_types_change() -> None:
    node = CountingNode()
    source = RclpyGraphSource(node, self_node_name="/ros_studio_1")

    source.snapshot()
    source.snapshot()
    assert node.calls == 1

    node.types["/chatter"] = ["std_msgs/msg/String", "std_msgs/msg/Header"]
    source.snapshot()
    assert node.calls == 2


def test_thread_source_reuses_the_cache_until_the_node_changes() -> None:
    node = CountingNode()
    ros = SimpleNamespace(node=node, node_name="ros_studio_1")
    source = ThreadGraphSource(ros)  # type: ignore[arg-type]

    source.snapshot()
    source.snapshot()
    assert node.calls == 1

    ros.node = CountingNode()
    source.snapshot()
    assert node.calls == 1
