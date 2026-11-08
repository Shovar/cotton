from __future__ import annotations

from fastapi import APIRouter, Request

from ros_studio.env import EnvironmentInfo

health_router = APIRouter(prefix="/api", tags=["system"])
router = APIRouter(prefix="/api", tags=["system"])


@health_router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/env")
async def read_environment(request: Request) -> EnvironmentInfo:
    return request.app.state.env
