from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from html import escape
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from starlette.types import Receive, Scope, Send

from cotton.api import routes_env, ws
from cotton.errors import install_error_handlers
from cotton.security import require_auth
from cotton.services import Services


def _viewer_missing_page(viewer_dir: Path) -> str:
    cache = escape(str(viewer_dir.parent))
    return f"""<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><title>Visor no disponible</title></head>
  <body>
    <h1>Visor Lichtblick no disponible</h1>
    <p>Cotton descarga el visor fijado en el primer arranque. Revisa la conexión y reinicia,
    o copia <code>lichtblick-web.tar.gz</code> en <code>{cache}</code> antes de arrancar.</p>
  </body>
</html>"""


def create_app(services: Services) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        services.ros.start()
        try:
            services.db.migrate()
            for hook in services.startup:
                await hook()
            yield
        finally:
            for hook in reversed(services.shutdown):
                await hook()
            services.ros.stop()
            services.db.close()

    app = FastAPI(title="Cotton", version=services.env.app_version, lifespan=lifespan)
    app.state.env = services.env
    app.state.auth = services.auth
    app.state.services = services
    install_error_handlers(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=sorted(services.auth.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(routes_env.health_router)
    app.include_router(routes_env.router, dependencies=[Depends(require_auth)])
    for router in services.routers:
        app.include_router(router, dependencies=[Depends(require_auth)])
    app.include_router(ws.router)
    mount_viewer(app, services.viewer_dir)
    mount_spa(app, services.spa_dir)
    return app


def mount_viewer(app: FastAPI, viewer_dir: Path | None) -> None:
    if viewer_dir is None:
        return
    static = StaticFiles(directory=viewer_dir, html=True, check_dir=False)

    async def viewer(scope: Scope, receive: Receive, send: Send) -> None:
        if (viewer_dir / "index.html").is_file():
            await static(scope, receive, send)
            return
        response = HTMLResponse(_viewer_missing_page(viewer_dir), status_code=503)
        await response(scope, receive, send)

    app.mount("/lichtblick", viewer, name="lichtblick")


class ImmutableStaticFiles(StaticFiles):
    """Serves hashed bundles that never change once built."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
        return response


def mount_spa(app: FastAPI, web_dir: Path | None) -> None:
    if web_dir is None or not (web_dir / "index.html").is_file():

        @app.get("/", include_in_schema=False)
        async def frontend_not_built() -> JSONResponse:
            return JSONResponse(
                status_code=404,
                content={"code": "frontend_not_built", "message": "Run npm run build"},
            )

        return

    assets = web_dir / "assets"
    if assets.is_dir():
        app.mount("/assets", ImmutableStaticFiles(directory=assets), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        reserved = path in {"api", "ws", "docs", "redoc", "openapi.json"} or path.startswith(
            ("api/", "ws/")
        )
        if reserved:
            raise HTTPException(status_code=404)
        # The entry HTML names hashed assets, so it must never be cached.
        return FileResponse(web_dir / "index.html", headers={"Cache-Control": "no-store"})
