from __future__ import annotations

import pytest
from pydantic import ValidationError

from cotton.plugins.models import PluginManifest

MINIMAL: dict[str, object] = {
    "name": "demo",
    "version": "0.1.0",
    "description": "Demo plugin",
    "panels": [{"id": "viewer", "type": "iframe", "url": "http://{hostname}:8000/view"}],
    "permissions": ["network"],
}


def test_valid_manifest_keeps_the_panel_url() -> None:
    manifest = PluginManifest.model_validate(MINIMAL)

    assert manifest.panels[0].url == "http://{hostname}:8000/view"


def test_duplicate_panel_ids_are_rejected() -> None:
    panels = [{"id": "viewer", "type": "iframe", "url": "http://localhost"}]
    data = {**MINIMAL, "panels": panels * 2}

    with pytest.raises(ValidationError, match="duplicate panel id"):
        PluginManifest.model_validate(data)


def test_panel_requires_a_url() -> None:
    data = {**MINIMAL, "panels": [{"id": "viewer", "type": "iframe"}]}

    with pytest.raises(ValidationError, match="requires a url"):
        PluginManifest.model_validate(data)


def test_name_is_validated() -> None:
    with pytest.raises(ValidationError, match="invalid plugin name"):
        PluginManifest.model_validate({**MINIMAL, "name": "Bad Name"})


def test_healthcheck_url_scheme_is_validated() -> None:
    with pytest.raises(ValidationError, match="healthcheck url"):
        PluginManifest.model_validate({**MINIMAL, "healthcheck": {"url": "ftp://localhost"}})


def test_manifest_to_dict_matches_the_contract() -> None:
    payload = PluginManifest.model_validate(MINIMAL).to_dict()

    assert set(payload) == {
        "name",
        "version",
        "description",
        "panels",
        "permissions",
    }
