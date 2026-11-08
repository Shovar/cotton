from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from ros_studio.api import routes_env, ws
from ros_studio.errors import install_error_handlers
from ros_studio.services import Services


def create_app(services: Services) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        services.ros.start()
        try:
            for hook in services.startup:
                await hook()
            yield
        finally:
            for hook in reversed(services.shutdown):
                await hook()
            services.ros.stop()

    app = FastAPI(title="ROS Studio", version=services.env.app_version, lifespan=lifespan)
    app.state.env = services.env
    app.state.services = services
    install_error_handlers(app)
    app.include_router(routes_env.router)
    for router in services.routers:
        app.include_router(router)
    app.include_router(ws.router)
    return app
