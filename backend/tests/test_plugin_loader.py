from __future__ import annotations

from pathlib import Path

import yaml

from cotton.plugins.loader import BUILTIN_PLUGINS_DIR, PluginLoader


def write_plugin(root: Path, name: str, **overrides: object) -> Path:
    data: dict[str, object] = {"name": name, "version": "0.1.0"}
    data.update(overrides)
    directory = root / name
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "plugin.yaml"
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    return path


def test_discovers_a_valid_manifest(tmp_path: Path) -> None:
    write_plugin(tmp_path / "builtin", "demo")

    plugins = PluginLoader(tmp_path / "builtin", tmp_path / "user").discover()

    assert [plugin.name for plugin in plugins] == ["demo"]
    assert plugins[0].error is None
    assert plugins[0].manifest is not None
    assert plugins[0].manifest.version == "0.1.0"


def test_missing_requirement_is_recorded_without_dropping_others(tmp_path: Path) -> None:
    write_plugin(tmp_path / "builtin", "demo", requires=["ghost"])
    write_plugin(tmp_path / "builtin", "other")

    plugins = {plugin.name: plugin for plugin in PluginLoader(tmp_path / "builtin").discover()}

    assert plugins["demo"].error is not None
    assert "ghost" in plugins["demo"].error
    assert plugins["other"].error is None


def test_user_plugin_overrides_the_builtin_one(tmp_path: Path) -> None:
    write_plugin(tmp_path / "builtin", "demo", description="builtin")
    write_plugin(tmp_path / "user", "demo", description="user")

    plugins = PluginLoader(tmp_path / "builtin", tmp_path / "user").discover()

    assert len(plugins) == 1
    assert plugins[0].manifest is not None
    assert plugins[0].manifest.description == "user"


def test_invalid_manifest_is_reported(tmp_path: Path) -> None:
    directory = tmp_path / "builtin" / "broken"
    directory.mkdir(parents=True)
    (directory / "plugin.yaml").write_text("name: [", encoding="utf-8")

    plugins = PluginLoader(tmp_path / "builtin").discover()

    assert plugins[0].name == "broken"
    assert plugins[0].error is not None
    assert "plugin.yaml" in plugins[0].error


def test_builtin_foxglove_manifest_is_discovered() -> None:
    plugin = next(
        plugin
        for plugin in PluginLoader(BUILTIN_PLUGINS_DIR).discover()
        if plugin.name == "foxglove"
    )

    assert plugin.error is None
    assert plugin.manifest is not None
    assert plugin.manifest.healthcheck is not None
    assert plugin.manifest.healthcheck.url == "tcp://127.0.0.1:8765"
    assert any(panel.type == "iframe" for panel in plugin.manifest.panels)


def test_builtin_foxglove_panel_uses_the_runtime_port() -> None:
    plugin = next(
        plugin
        for plugin in PluginLoader(BUILTIN_PLUGINS_DIR).discover()
        if plugin.name == "foxglove"
    )

    url = plugin.manifest.panels[0].url
    assert url is not None
    assert ":8000" not in url
    assert "http://{host}/" in url
    assert "ws://{hostname}:8765" in url
