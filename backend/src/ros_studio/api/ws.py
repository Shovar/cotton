from __future__ import annotations

import asyncio
import contextlib

from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect

from ros_studio.errors import ApiError
from ros_studio.security import Auth
from ros_studio.services import Services

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    services: Services = websocket.app.state.services
    auth: Auth = websocket.app.state.auth
    try:
        auth.check_ws(websocket.query_params.get("token"), websocket.headers.get("origin"))
    except ApiError:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    queue = services.bus.subscribe()
    subscribed: set[str] = set()
    send_lock = asyncio.Lock()

    async def send(payload: dict[str, object]) -> None:
        async with send_lock:
            await websocket.send_json(payload)

    async def forward() -> None:
        while True:
            event = await queue.get()
            for name in tuple(subscribed):
                channel = services.channels.get(name)
                if channel is not None and channel.matches(event):
                    await send({"type": event.type, "data": event.data})
                    break

    forward_task = asyncio.create_task(forward())
    try:
        while True:
            message = await websocket.receive_json()
            if not isinstance(message, dict) or message.get("type") != "subscribe":
                await send(
                    {
                        "type": "error",
                        "data": {
                            "code": "unsupported_message",
                            "message": "Only subscribe messages are supported",
                        },
                    }
                )
                continue
            names = message.get("channels")
            if not isinstance(names, list) or not all(isinstance(name, str) for name in names):
                await send(
                    {
                        "type": "error",
                        "data": {
                            "code": "invalid_message",
                            "message": "channels must be a list of strings",
                        },
                    }
                )
                continue
            unknown = [name for name in names if services.channels.get(name) is None]
            if unknown:
                await send(
                    {
                        "type": "error",
                        "data": {
                            "code": "unknown_channel",
                            "message": f"Unknown channel: {unknown[0]}",
                        },
                    }
                )
                continue
            new_names = [name for name in names if name not in subscribed]
            subscribed.update(new_names)
            for name in new_names:
                channel = services.channels.get(name)
                if channel is not None and channel.initial is not None:
                    for event in await channel.initial():
                        await send({"type": event.type, "data": event.data})
    except WebSocketDisconnect:
        pass
    finally:
        forward_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await forward_task
        services.bus.unsubscribe(queue)
