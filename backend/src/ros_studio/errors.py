from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from ros_studio.env import RosEnvironmentError

_HTTP_CODES = {
    400: "invalid_request",
    401: "unauthorized",
    403: "forbidden_origin",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    500: "internal_error",
}


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def error_payload(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content=error_payload(exc.code, exc.message))

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, "error")
        return JSONResponse(
            status_code=exc.status_code, content=error_payload(code, str(exc.detail))
        )

    @app.exception_handler(RosEnvironmentError)
    async def handle_ros_environment_error(
        _request: Request, exc: RosEnvironmentError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=500, content=error_payload("ros_environment_error", str(exc))
        )
