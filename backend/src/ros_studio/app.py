from __future__ import annotations

from fastapi import FastAPI

from ros_studio.api import routes_env
from ros_studio.env import EnvironmentInfo
from ros_studio.errors import install_error_handlers


def create_app(env: EnvironmentInfo) -> FastAPI:
    app = FastAPI(title="ROS Studio", version=env.app_version)
    app.state.env = env
    install_error_handlers(app)
    app.include_router(routes_env.router)
    return app
