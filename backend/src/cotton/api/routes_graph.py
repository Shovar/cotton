from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from cotton.channels import Channel
from cotton.events import Event
from cotton.ros.models import GraphSnapshot
from cotton.ros.watcher import GraphWatcher


def create_router(watcher: GraphWatcher) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["graph"])

    @router.get("/graph")
    async def read_graph() -> dict[str, Any]:
        snapshot = watcher.current() or GraphSnapshot(nodes=[], topics=[])
        return snapshot.to_dict()

    return router


def graph_channel(watcher: GraphWatcher) -> Channel:
    async def initial() -> list[Event]:
        events = []
        snapshot = watcher.current()
        if snapshot is not None:
            events.append(Event("graph.update", snapshot.to_dict()))
        events.append(Event("ros.status", watcher.current_status()))
        return events

    return Channel(
        "graph",
        matches=lambda event: event.type in {"graph.update", "ros.status"},
        initial=initial,
    )
