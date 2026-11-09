from __future__ import annotations

import secrets
import shlex
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from ros_studio.channels import Channel, ChannelRegistry
from ros_studio.errors import ApiError
from ros_studio.events import Event
from ros_studio.processes.manager import ProcessConflict, ProcessManager, ProcessNotFound
from ros_studio.processes.models import ProcessSpec

MAX_LOG_LINES = 2000
DEFAULT_LOG_LINES = 200


class ProcessRequest(BaseModel):
    id: str | None = None
    command: str | list[str]
    args: list[str] = []
    cwd: str | None = None
    env: dict[str, str] = {}


def create_router(manager: ProcessManager) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["processes"])

    @router.get("/processes")
    async def list_processes() -> list[dict[str, Any]]:
        return [record.to_dict() for record in manager.list()]

    @router.post("/processes", status_code=201)
    async def create_process(body: ProcessRequest) -> dict[str, Any]:
        try:
            record = await manager.start(_spec_from(body))
        except ProcessConflict as exc:
            raise ApiError(409, "process_conflict", str(exc)) from exc
        except ValueError as exc:
            raise ApiError(422, "validation_error", str(exc)) from exc
        return record.to_dict()

    @router.delete("/processes/{process_id}")
    async def delete_process(process_id: str) -> dict[str, Any]:
        try:
            record = await manager.stop(process_id)
        except ProcessNotFound as exc:
            raise ApiError(404, "process_not_found", str(exc)) from exc
        return record.to_dict()

    @router.post("/processes/{process_id}/restart")
    async def restart_process(process_id: str) -> dict[str, Any]:
        try:
            record = await manager.restart(process_id)
        except ProcessNotFound as exc:
            raise ApiError(404, "process_not_found", str(exc)) from exc
        except ProcessConflict as exc:
            raise ApiError(409, "process_conflict", str(exc)) from exc
        return record.to_dict()

    @router.get("/processes/{process_id}/logs")
    async def read_logs(process_id: str, lines: int = DEFAULT_LOG_LINES) -> list[dict[str, Any]]:
        try:
            buffer = manager.logs(process_id)
        except ProcessNotFound as exc:
            raise ApiError(404, "process_not_found", str(exc)) from exc
        return [line.to_dict() for line in buffer.tail(min(max(lines, 1), MAX_LOG_LINES))]

    return router


def register_process_channels(registry: ChannelRegistry, manager: ProcessManager) -> None:
    async def initial() -> list[Event]:
        return [Event("process.state", record.to_dict()) for record in manager.list()]

    registry.register(
        Channel(
            "processes",
            matches=lambda event: event.type == "process.state",
            initial=initial,
        )
    )
    registry.register_family("logs:", lambda name: _log_channel(manager, name))


def _log_channel(manager: ProcessManager, name: str) -> Channel | None:
    process_id = name.removeprefix("logs:")
    try:
        manager.get(process_id)
    except ProcessNotFound:
        return None

    async def initial() -> list[Event]:
        buffer = manager.logs(process_id)
        return [Event("process.log", line.to_dict()) for line in buffer.tail(DEFAULT_LOG_LINES)]

    return Channel(
        name,
        matches=lambda event: event.type == "process.log" and event.data.get("id") == process_id,
        initial=initial,
    )


def _spec_from(body: ProcessRequest) -> ProcessSpec:
    argv = shlex.split(body.command) if isinstance(body.command, str) else list(body.command)
    argv.extend(body.args)
    if not argv:
        raise ValueError("command must contain at least one element")
    return ProcessSpec(
        id=body.id or f"p_{secrets.token_hex(4)}",
        argv=argv,
        cwd=body.cwd,
        env=dict(body.env),
    )
