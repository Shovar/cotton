from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

PluginState = Literal["discovered", "active", "stopped", "error"]
PanelType = Literal["iframe", "stream", "native"]

_ID = re.compile(r"^[a-z0-9][a-z0-9_.-]*$")
_PANEL_URL_SCHEMES = ("http://", "https://")
_HEALTHCHECK_SCHEMES = ("tcp://", "http://", "https://")


def _check_id(value: str, kind: str) -> str:
    if not _ID.fullmatch(value):
        raise ValueError(f"invalid {kind} id: {value!r}")
    return value


class PanelSpec(BaseModel):
    id: str
    title: str = ""
    type: PanelType = "iframe"
    url: str | None = None

    @field_validator("id")
    @classmethod
    def _valid_id(cls, value: str) -> str:
        return _check_id(value, "panel")

    @model_validator(mode="after")
    def _url_required(self) -> PanelSpec:
        if self.type in {"iframe", "stream"} and not (
            self.url and self.url.startswith(_PANEL_URL_SCHEMES)
        ):
            raise ValueError(f"panel {self.id} requires a url")
        return self


class HealthcheckSpec(BaseModel):
    url: str
    timeout_s: float = Field(default=5.0, gt=0)
    retries: int = Field(default=20, ge=1)
    delay_s: float = Field(default=0.25, ge=0)

    @field_validator("url")
    @classmethod
    def _valid_scheme(cls, value: str) -> str:
        if not value.startswith(_HEALTHCHECK_SCHEMES):
            raise ValueError("healthcheck url must use tcp://, http:// or https://")
        return value


class PluginManifest(BaseModel):
    name: str
    version: str = "0.0.0"
    description: str = ""
    panels: list[PanelSpec] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    requires: list[str] = Field(default_factory=list)
    healthcheck: HealthcheckSpec | None = None

    @field_validator("name")
    @classmethod
    def _valid_name(cls, value: str) -> str:
        if not _ID.fullmatch(value):
            raise ValueError(f"invalid plugin name: {value!r}")
        return value

    @field_validator("requires")
    @classmethod
    def _valid_requires(cls, value: list[str]) -> list[str]:
        for name in value:
            _check_id(name, "plugin")
        return value

    @model_validator(mode="after")
    def _unique_ids(self) -> PluginManifest:
        panel_ids = [panel.id for panel in self.panels]
        duplicate = _first_duplicate(panel_ids)
        if duplicate is not None:
            raise ValueError(f"duplicate panel id: {duplicate}")
        return self

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(include={"name", "version", "description", "panels", "permissions"})


@dataclass(frozen=True)
class DiscoveredPlugin:
    name: str
    path: Path
    manifest: PluginManifest | None = None
    error: str | None = None


@dataclass
class PluginRecord:
    name: str
    state: PluginState
    manifest: PluginManifest | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "state": self.state,
            "error": self.error,
            "manifest": None if self.manifest is None else self.manifest.to_dict(),
        }


def _first_duplicate(values: list[str]) -> str | None:
    seen: set[str] = set()
    for value in values:
        if value in seen:
            return value
        seen.add(value)
    return None
