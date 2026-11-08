from __future__ import annotations

from fastapi import APIRouter, Request

from ros_studio.env import EnvironmentInfo

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/env")
async def read_environment(request: Request) -> EnvironmentInfo:
    return request.app.state.env
