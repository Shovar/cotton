from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from ros_studio.api import routes_env, ws
from ros_studio.errors import install_error_handlers
from ros_studio.security import require_auth
from ros_studio.services import Services


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

    app = FastAPI(title="ROS Studio", version=services.env.app_version, lifespan=lifespan)
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
    mount_spa(app, services.spa_dir)
    return app


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
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        reserved = path in {"api", "ws", "docs", "redoc", "openapi.json"} or path.startswith(
            ("api/", "ws/")
        )
        if reserved:
            raise HTTPException(status_code=404)
        return FileResponse(web_dir / "index.html")
