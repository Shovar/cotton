from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from ros_studio.channels import Channel, ChannelRegistry
from ros_studio.errors import ApiError
from ros_studio.events import Event
from ros_studio.plugins.manager import PluginError, PluginManager, PluginNotFound


def create_router(manager: PluginManager) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["plugins"])

    @router.get("/plugins")
    async def list_plugins() -> list[dict[str, Any]]:
        return [record.to_dict() for record in manager.all()]

    @router.post("/plugins/{name}/activate")
    async def activate_plugin(name: str) -> dict[str, Any]:
        try:
            record = await manager.activate(name)
        except PluginNotFound as exc:
            raise ApiError(404, "plugin_not_found", str(exc)) from exc
        except PluginError as exc:
            raise ApiError(409, "plugin_error", str(exc)) from exc
        return record.to_dict()

    @router.delete("/plugins/{name}/activate")
    async def deactivate_plugin(name: str) -> dict[str, Any]:
        try:
            record = await manager.deactivate(name)
        except PluginNotFound as exc:
            raise ApiError(404, "plugin_not_found", str(exc)) from exc
        return record.to_dict()

    return router


def register_plugin_channel(registry: ChannelRegistry, manager: PluginManager) -> None:
    async def initial() -> list[Event]:
        return [Event("plugin.state", record.to_dict()) for record in manager.all()]

    registry.register(
        Channel(
            "plugins",
            matches=lambda event: event.type == "plugin.state",
            initial=initial,
        )
    )
