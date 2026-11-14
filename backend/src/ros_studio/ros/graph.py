from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace
from typing import Protocol

from ros_studio.ros.models import GraphSnapshot, NodeInfo, TopicInfo
from ros_studio.ros.thread import RosCallError, RosThread


class EndpointLike(Protocol):
    node_name: str
    node_namespace: str


class NodeLike(Protocol):
    def get_node_names_and_namespaces(self) -> list[tuple[str, str]]: ...

    def get_topic_names_and_types(self) -> list[tuple[str, list[str]]]: ...

    def get_service_names_and_types(self) -> list[tuple[str, list[str]]]: ...

    def get_publishers_info_by_topic(self, topic: str) -> list[EndpointLike]: ...

    def get_subscriptions_info_by_topic(self, topic: str) -> list[EndpointLike]: ...


class GraphSource(Protocol):
    def snapshot(self) -> GraphSnapshot: ...


class RclpyGraphSource:
    """Reads one immutable graph snapshot from an rclpy node."""

    def __init__(self, node: NodeLike, self_node_name: str) -> None:
        self._node = node
        self._self_node_name = self_node_name
        self._cache: dict[str, tuple[tuple[str, ...], list[str], list[str]]] = {}

    def snapshot(self) -> GraphSnapshot:
        services = {
            name: types
            for name, types in _typed_names(self._node.get_service_names_and_types()).items()
            if not _owned_by_app(name, self._self_node_name)
        }
        actions = {
            name: types
            for name, types in _typed_names(_action_names(self._node)).items()
            if not _owned_by_app(name, self._self_node_name)
        }
        raw_topics = []
        for name, types in self._node.get_topic_names_and_types():
            publishers, subscribers = self._topic_endpoints(name, types)
            raw_topics.append(
                TopicInfo(
                    name=name,
                    types=sorted(types),
                    publishers=publishers,
                    subscribers=subscribers,
                )
            )
        topics = [
            replace(
                topic,
                publishers=[
                    name
                    for name in topic.publishers
                    if not _owned_by_app(name, self._self_node_name)
                ],
                subscribers=[
                    name
                    for name in topic.subscribers
                    if not _owned_by_app(name, self._self_node_name)
                ],
            )
            for topic in raw_topics
        ]
        published = _topics_by_endpoint(topics, "publishers")
        subscribed = _topics_by_endpoint(topics, "subscribers")
        nodes = [
            self._node_info(
                name,
                namespace,
                services,
                actions,
                published.get(full_name, []),
                subscribed.get(full_name, []),
            )
            for name, namespace in self._node.get_node_names_and_namespaces()
            if not _owned_by_app(full_name := _full_name(name, namespace), self._self_node_name)
        ]
        return GraphSnapshot(
            nodes=sorted(nodes, key=lambda node: node.name),
            topics=sorted(topics, key=lambda topic: topic.name),
            services=services,
            actions=actions,
        )

    def _topic_endpoints(self, name: str, types: list[str]) -> tuple[list[str], list[str]]:
        key = tuple(sorted(types))
        cached = self._cache.get(name)
        if cached is not None and cached[0] == key:
            return cached[1], cached[2]
        # shortcut: endpoints refresh only when a topic's types change; upgrade to a
        # periodic full refresh if a publisher appears without a type change.
        publishers = _endpoints(self._node.get_publishers_info_by_topic(name))
        subscribers = _endpoints(self._node.get_subscriptions_info_by_topic(name))
        self._cache[name] = (key, publishers, subscribers)
        return publishers, subscribers

    def _node_info(
        self,
        name: str,
        namespace: str,
        services: Mapping[str, list[str]],
        actions: Mapping[str, list[str]],
        publishers: list[str],
        subscribers: list[str],
    ) -> NodeInfo:
        full_name = _full_name(name, namespace)
        prefix = f"{full_name}/"
        return NodeInfo(
            name=full_name,
            namespace=namespace or "/",
            publishers=sorted(publishers),
            subscribers=sorted(subscribers),
            services=sorted(service for service in services if service.startswith(prefix)),
            actions=sorted(action for action in actions if action.startswith(prefix)),
        )


class ThreadGraphSource:
    """Resolves the ROS node lazily so the watcher can be built before startup."""

    def __init__(self, ros: RosThread) -> None:
        self._ros = ros
        self._source: RclpyGraphSource | None = None
        self._node: object | None = None

    def snapshot(self) -> GraphSnapshot:
        node = self._ros.node
        if node is None:
            raise RosCallError("the ROS thread is not running")
        if self._source is None or self._node is not node:
            self._source = RclpyGraphSource(node, f"/{self._ros.node_name}")
            self._node = node
        return self._source.snapshot()


def _full_name(name: str, namespace: str) -> str:
    return f"{namespace.rstrip('/')}/{name}"


def _owned_by_app(name: str, self_node_name: str) -> bool:
    return (
        name == self_node_name
        or name.startswith(f"{self_node_name}_")
        or name.startswith(f"{self_node_name}/")
    )


def _typed_names(
    entries: list[tuple[str, list[str]]],
) -> dict[str, list[str]]:
    return {name: sorted(types) for name, types in sorted(entries)}


def _action_names(node: NodeLike) -> list[tuple[str, list[str]]]:
    get_actions = getattr(node, "get_action_names_and_types", None)
    if not callable(get_actions):
        return []
    return list(get_actions())


def _endpoints(endpoints: list[EndpointLike]) -> list[str]:
    names = {_full_name(endpoint.node_name, endpoint.node_namespace) for endpoint in endpoints}
    return sorted(names)


def _topics_by_endpoint(topics: list[TopicInfo], attribute: str) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for topic in topics:
        for endpoint in getattr(topic, attribute):
            result.setdefault(endpoint, []).append(topic.name)
    return {endpoint: sorted(names) for endpoint, names in result.items()}
