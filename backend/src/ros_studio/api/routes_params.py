from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from ros_studio.errors import ApiError, ros_call_error
from ros_studio.ros.params import ParamsSource
from ros_studio.ros.thread import RosCallError, RosThread


class ParamValue(BaseModel):
    value: Any


def create_router(ros: RosThread, params: ParamsSource) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["params"])

    @router.get("/nodes/{node_name:path}/params")
    async def read_params(node_name: str) -> dict[str, Any]:
        return await _run(ros, params.get_all, _absolute(node_name))

    @router.put("/nodes/{node_name:path}/params/{param}", status_code=204)
    async def write_param(node_name: str, param: str, body: ParamValue) -> None:
        await _run(ros, params.set, _absolute(node_name), param, body.value)

    return router


async def _run(ros: RosThread, call: Callable[..., Any], *args: Any) -> Any:
    try:
        return await ros.call(call, *args)
    except RosCallError as exc:
        raise ros_call_error(exc) from exc
    except ValueError as exc:
        raise ApiError(422, "validation_error", str(exc)) from exc


def _absolute(node_name: str) -> str:
    if not node_name.startswith("/"):
        raise ApiError(422, "validation_error", f"node name must be absolute: {node_name!r}")
    return node_name
