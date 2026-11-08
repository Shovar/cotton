from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Header, Request

from ros_studio.errors import ApiError


def generate_token() -> str:
    return secrets.token_urlsafe(32)


class Auth:
    def __init__(self, token: str, allowed_origins: set[str]) -> None:
        self.token = token
        self.allowed_origins = frozenset(allowed_origins)

    def check_bearer(self, authorization: str | None) -> None:
        scheme, separator, token = (authorization or "").partition(" ")
        if (
            scheme.lower() != "bearer"
            or not separator
            or not secrets.compare_digest(token, self.token)
        ):
            raise ApiError(401, "unauthorized", "Missing or invalid bearer token")

    def check_ws(self, token: str | None, origin: str | None) -> None:
        if origin is None or origin not in self.allowed_origins:
            raise ApiError(403, "forbidden_origin", "Origin is not allowed")
        if token is None or not secrets.compare_digest(token, self.token):
            raise ApiError(401, "unauthorized", "Missing or invalid session token")


def require_auth(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    auth: Auth = request.app.state.auth
    auth.check_bearer(authorization)
