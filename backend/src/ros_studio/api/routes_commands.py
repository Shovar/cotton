from __future__ import annotations

import asyncio

from fastapi import APIRouter

from ros_studio.command_catalog import executable_names

router = APIRouter(prefix="/api", tags=["commands"])


@router.get("/commands")
async def list_commands() -> list[str]:
    return await asyncio.to_thread(executable_names)
