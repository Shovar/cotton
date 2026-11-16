from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from cotton.errors import ApiError
from cotton.processes.manager import ProcessConflict, ProcessManager
from cotton.processes.models import ProcessRecord
from cotton.processes.profiles import Profile, ProfileStore


class ProfileBody(BaseModel):
    id: str
    name: str = ""
    processes: list[dict[str, Any]] = []


def create_router(manager: ProcessManager, profiles: ProfileStore) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["profiles"])

    @router.get("/profiles")
    async def list_profiles() -> list[dict[str, Any]]:
        return [profile.to_dict() for profile in profiles.list()]

    @router.post("/profiles", status_code=201)
    async def create_profile(body: ProfileBody) -> dict[str, Any]:
        return profiles.upsert(_profile(body)).to_dict()

    @router.put("/profiles/{profile_id}")
    async def update_profile(profile_id: str, body: ProfileBody) -> dict[str, Any]:
        _required(profiles, profile_id)
        return profiles.upsert(_profile(body, profile_id)).to_dict()

    @router.delete("/profiles/{profile_id}", status_code=204)
    async def delete_profile(profile_id: str) -> None:
        _required(profiles, profile_id)
        profiles.delete(profile_id)

    @router.post("/profiles/{profile_id}/start")
    async def start_profile(profile_id: str) -> list[dict[str, Any]]:
        profile = _required(profiles, profile_id)
        started: list[ProcessRecord] = []
        try:
            for spec in profile.processes:
                record = await manager.start(spec)
                if record.state == "failed":
                    raise ProcessConflict(record.error or f"process {spec.id} failed to start")
                started.append(record)
        except ProcessConflict as exc:
            await _stop_all(manager, started)
            raise ApiError(409, "profile_start_failed", str(exc)) from exc
        except ValueError as exc:
            await _stop_all(manager, started)
            raise ApiError(422, "validation_error", str(exc)) from exc
        return [record.to_dict() for record in started]

    return router


def _required(profiles: ProfileStore, profile_id: str) -> Profile:
    profile = profiles.get(profile_id)
    if profile is None:
        raise ApiError(404, "not_found", f"unknown profile: {profile_id}")
    return profile


async def _stop_all(manager: ProcessManager, records: list[ProcessRecord]) -> None:
    for record in reversed(records):
        await manager.stop(record.id)


def _profile(body: ProfileBody, profile_id: str | None = None) -> Profile:
    try:
        return Profile.from_dict({**body.model_dump(), "id": profile_id or body.id})
    except (KeyError, TypeError, ValueError) as exc:
        raise ApiError(422, "validation_error", f"invalid profile: {exc}") from exc
