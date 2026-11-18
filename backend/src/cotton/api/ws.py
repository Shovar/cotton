from __future__ import annotations

import asyncio
import base64
import binascii
import contextlib

from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect

from cotton.errors import ApiError
from cotton.security import Auth
from cotton.services import Services
from cotton.terminals.manager import TerminalNotFound

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
    attached_terminals: set[str] = set()
    terminal_watermarks: dict[str, int] = {}
    send_lock = asyncio.Lock()
    terminal_lock = asyncio.Lock()

    async def send(payload: dict[str, object]) -> None:
        async with send_lock:
            await websocket.send_json(payload)

    async def send_error(code: str, message: str) -> None:
        await send({"type": "error", "data": {"code": code, "message": message}})

    async def forward() -> None:
        while True:
            event = await queue.get()
            async with terminal_lock:
                for name in tuple(subscribed):
                    channel = services.channels.get(name)
                    if channel is None or not channel.matches(event):
                        continue
                    if name.startswith("terminal:") and event.type == "terminal.output":
                        terminal_id = name.removeprefix("terminal:")
                        sequence = event.data.get("sequence")
                        if not isinstance(sequence, int):
                            continue
                        if sequence <= terminal_watermarks.get(terminal_id, -1):
                            continue
                        terminal_watermarks[terminal_id] = sequence
                    await send({"type": event.type, "data": event.data})
                    break

    async def attach_terminal(data: dict[str, object]) -> None:
        terminal_id = data.get("id")
        after_sequence = data.get("after_sequence")
        manager = services.terminal_manager
        if manager is None:
            await send_error("terminal_unavailable", "Terminal sessions are unavailable")
            return
        if (
            not isinstance(terminal_id, str)
            or not terminal_id
            or not isinstance(after_sequence, int)
            or isinstance(after_sequence, bool)
            or after_sequence < 0
        ):
            await send_error(
                "invalid_terminal_payload", "id and non-negative after_sequence are required"
            )
            return

        channel_name = f"terminal:{terminal_id}"
        async with terminal_lock:
            try:
                record = manager.get(terminal_id)
                channel = services.channels.get(channel_name)
                if channel is None:
                    raise TerminalNotFound(f"unknown terminal: {terminal_id}")
                attached_terminals.add(terminal_id)
                subscribed.add(channel_name)
                retained_chunks = manager.output_since(terminal_id, 0)
                chunks = [chunk for chunk in retained_chunks if chunk.sequence > after_sequence]
            except TerminalNotFound as exc:
                await send_error("terminal_not_found", str(exc))
                return

            terminal_watermarks[terminal_id] = max(
                (chunk.sequence for chunk in retained_chunks), default=0
            )
            await send({"type": "terminal.state", "data": record.to_dict()})
            for chunk in chunks:
                await send(
                    {
                        "type": "terminal.output",
                        "data": {
                            "id": terminal_id,
                            "sequence": chunk.sequence,
                            "data": base64.b64encode(chunk.data).decode("ascii"),
                        },
                    }
                )

    async def detach_terminal(data: dict[str, object]) -> None:
        terminal_id = data.get("id")
        if not isinstance(terminal_id, str) or terminal_id not in attached_terminals:
            await send_error("terminal_not_attached", "Terminal is not attached")
            return
        async with terminal_lock:
            attached_terminals.discard(terminal_id)
            subscribed.discard(f"terminal:{terminal_id}")
            terminal_watermarks.pop(terminal_id, None)

    async def control_terminal(data: dict[str, object], message_type: str) -> None:
        terminal_id = data.get("id")
        manager = services.terminal_manager
        if manager is None:
            await send_error("terminal_unavailable", "Terminal sessions are unavailable")
            return
        if not isinstance(terminal_id, str) or terminal_id not in attached_terminals:
            await send_error("terminal_not_attached", "Terminal is not attached")
            return

        try:
            if message_type == "terminal.input":
                encoded = data.get("data")
                if not isinstance(encoded, str):
                    raise ValueError("data must be a base64 string")
                payload = base64.b64decode(encoded, validate=True)
                await manager.write_input(terminal_id, payload)
            else:
                cols = data.get("cols")
                rows = data.get("rows")
                if (
                    not isinstance(cols, int)
                    or isinstance(cols, bool)
                    or not isinstance(rows, int)
                    or isinstance(rows, bool)
                ):
                    raise ValueError("cols and rows must be integers")
                await manager.resize(terminal_id, cols, rows)
        except TerminalNotFound as exc:
            await send_error("terminal_not_found", str(exc))
        except (binascii.Error, ValueError) as exc:
            await send_error("invalid_terminal_payload", str(exc))
        except RuntimeError as exc:
            await send_error("terminal_not_running", str(exc))
        except OSError as exc:
            await send_error("terminal_io_error", str(exc))

    forward_task = asyncio.create_task(forward())
    try:
        while True:
            message = await websocket.receive_json()
            if not isinstance(message, dict):
                await send_error("invalid_message", "WebSocket message must be an object")
                continue
            message_type = message.get("type")
            if isinstance(message_type, str) and message_type in {
                "terminal.attach",
                "terminal.detach",
                "terminal.input",
                "terminal.resize",
            }:
                data = message.get("data")
                if not isinstance(data, dict):
                    await send_error("invalid_terminal_payload", "data must be an object")
                    continue
                if message_type == "terminal.attach":
                    await attach_terminal(data)
                elif message_type == "terminal.detach":
                    await detach_terminal(data)
                else:
                    await control_terminal(data, message_type)
                continue
            if message_type != "subscribe":
                await send_error(
                    "unsupported_message", "Only subscribe and terminal messages are supported"
                )
                continue
            names = message.get("channels")
            if not isinstance(names, list) or not all(isinstance(name, str) for name in names):
                await send_error("invalid_message", "channels must be a list of strings")
                continue
            if any(name.startswith("terminal:") for name in names):
                await send_error(
                    "terminal_attach_required",
                    "Use terminal.attach to subscribe to a terminal session",
                )
                continue
            unknown = [name for name in names if services.channels.get(name) is None]
            if unknown:
                await send_error("unknown_channel", f"Unknown channel: {unknown[0]}")
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
        attached_terminals.clear()
        subscribed.clear()
        forward_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await forward_task
        services.bus.unsubscribe(queue)
