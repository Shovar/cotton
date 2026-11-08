from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ros_studio.env import EnvironmentInfo
from ros_studio.security import require_auth

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/env", dependencies=[Depends(require_auth)])
async def read_environment(request: Request) -> EnvironmentInfo:
    return request.app.state.env
