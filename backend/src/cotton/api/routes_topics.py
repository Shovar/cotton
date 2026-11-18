from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from cotton.errors import ros_call_error
from cotton.ros.rate import RateSource
from cotton.ros.thread import RosCallError, RosThread

WINDOW_RANGE = (0.5, 5.0)


def create_router(ros: RosThread, rate: RateSource) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["topics"])

    @router.get("/topics/{topic:path}/rate")
    async def read_rate(topic: str, window_s: float = 2.0) -> dict[str, Any]:
        window = min(max(window_s, WINDOW_RANGE[0]), WINDOW_RANGE[1])
        try:
            result = await ros.call(rate.measure, topic, window)
        except RosCallError as exc:
            raise ros_call_error(exc) from exc
        return result.to_dict()

    return router
