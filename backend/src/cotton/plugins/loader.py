from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import yaml
from pydantic import ValidationError

from cotton.plugins.models import DiscoveredPlugin, PluginManifest

BUILTIN_PLUGINS_DIR = Path(__file__).resolve().parent.parent / "builtin_plugins"


class PluginLoader:
    """Discovers ``plugin.yaml`` manifests; a user plugin wins over the builtin one."""

    def __init__(
        self, builtin_dir: Path = BUILTIN_PLUGINS_DIR, user_dir: Path | None = None
    ) -> None:
        self._roots = [Path(builtin_dir), None if user_dir is None else Path(user_dir)]

    def discover(self) -> list[DiscoveredPlugin]:
        found: dict[str, DiscoveredPlugin] = {}
        for root in self._roots:
            if root is None or not root.is_dir():
                continue
            for manifest_path in sorted(root.glob("*/plugin.yaml")):
                plugin = _load(manifest_path)
                found[plugin.name] = plugin

        names = set(found)
        for plugin_name, plugin in list(found.items()):
            if plugin.manifest is None:
                continue
            missing = [name for name in plugin.manifest.requires if name not in names]
            if missing:
                found[plugin_name] = replace(plugin, error=f"missing required plugin: {missing[0]}")
        return list(found.values())


def _load(path: Path) -> DiscoveredPlugin:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        manifest = PluginManifest.model_validate(data)
    except (OSError, yaml.YAMLError, ValidationError, TypeError) as exc:
        return DiscoveredPlugin(name=path.parent.name, path=path.parent, error=f"{path}: {exc}")
    return DiscoveredPlugin(name=manifest.name, path=path.parent, manifest=manifest)
