from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class NodeInfo:
    name: str
    namespace: str
    publishers: list[str]
    subscribers: list[str]
    services: list[str]
    actions: list[str]


@dataclass(frozen=True)
class TopicInfo:
    name: str
    types: list[str]
    publishers: list[str]
    subscribers: list[str]


@dataclass(frozen=True)
class GraphSnapshot:
    nodes: list[NodeInfo]
    topics: list[TopicInfo]
    services: dict[str, list[str]] = field(default_factory=dict)
    actions: dict[str, list[str]] = field(default_factory=dict)
    revision: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
