from __future__ import annotations

import asyncio
import urllib.error
import urllib.request
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from urllib.parse import urlsplit

from cotton.events import EventBus
from cotton.plugins.loader import PluginLoader
from cotton.plugins.models import HealthcheckSpec, PluginRecord
from cotton.plugins.settings import SettingsRepository

ACTIVE_KEY = "plugins.active"


class PluginNotFound(RuntimeError):
    """No plugin is known under this name."""


class PluginError(RuntimeError):
    """The plugin cannot be activated or its healthcheck failed."""


class HealthcheckError(RuntimeError):
    """The healthcheck did not become healthy before the retries ran out."""


@dataclass(frozen=True)
class Healthcheck:
    url: str
    timeout_s: float = 5.0
    retries: int = 20
    delay_s: float = 0.25


async def check_health(check: Healthcheck) -> None:
    last_error: Exception | None = None
    for attempt in range(check.retries + 1):
        try:
            await asyncio.wait_for(_probe(check.url, check.timeout_s), check.timeout_s)
            return
        except (OSError, urllib.error.URLError, asyncio.TimeoutError) as exc:
            last_error = exc
            if attempt < check.retries:
                await asyncio.sleep(check.delay_s)
    raise HealthcheckError(f"healthcheck failed for {check.url}: {last_error}")


async def _probe(url: str, timeout_s: float) -> None:
    parts = urlsplit(url)
    if parts.scheme != "tcp":
        await asyncio.to_thread(_probe_http, url, timeout_s)
        return
    if parts.hostname is None or parts.port is None:
        raise OSError(f"invalid tcp healthcheck url: {url}")
    _, writer = await asyncio.open_connection(parts.hostname, parts.port)
    writer.close()
    await writer.wait_closed()


def _probe_http(url: str, timeout_s: float) -> None:
    with urllib.request.urlopen(url, timeout=timeout_s) as response:
        response.read(0)


class PluginManager:
    """Activates plugins in dependency order, waits for health and persists what is active."""

    def __init__(
        self,
        loader: PluginLoader,
        settings: SettingsRepository,
        bus: EventBus,
        healthcheck: Callable[[Healthcheck], Awaitable[None]] = check_health,
    ) -> None:
        self._settings = settings
        self._bus = bus
        self._healthcheck = healthcheck
        self._records: dict[str, PluginRecord] = {}
        self._active_order: list[str] = []
        for plugin in loader.discover():
            self._records[plugin.name] = PluginRecord(
                name=plugin.name,
                state="error" if plugin.error else "discovered",
                manifest=plugin.manifest,
                error=plugin.error,
            )

    def all(self) -> list[PluginRecord]:
        return [self._records[name] for name in sorted(self._records)]

    async def activate(self, name: str) -> PluginRecord:
        record = self._require(name)
        if record.state == "active":
            return record
        if record.manifest is None:
            raise PluginError(record.error or f"plugin {name} is not usable")

        activated: list[str] = []
        try:
            for plugin_name in self._order(name):
                target = self._require(plugin_name)
                if target.state == "active":
                    continue
                manifest = target.manifest
                if manifest is None:
                    raise PluginError(target.error or f"plugin {plugin_name} is not usable")
                if manifest.healthcheck is not None:
                    await self._healthcheck(_healthcheck(manifest.healthcheck))
                target.state = "active"
                target.error = None
                activated.append(plugin_name)
                if plugin_name not in self._active_order:
                    self._active_order.append(plugin_name)
                await self._publish(target)
        except (PluginError, HealthcheckError, ValueError, OSError) as exc:
            for plugin_name in activated:
                target = self._records[plugin_name]
                target.state = "stopped"
                target.error = None
                if plugin_name in self._active_order:
                    self._active_order.remove(plugin_name)
                await self._publish(target)
            if name in self._active_order:
                self._active_order.remove(name)
            record.state = "error"
            record.error = str(exc)
            self._persist()
            await self._publish(record)
            raise PluginError(str(exc)) from exc

        self._persist()
        return record

    async def deactivate(self, name: str) -> PluginRecord:
        record = self._require(name)
        if name in self._active_order:
            self._active_order.remove(name)
        record.state = "stopped"
        record.error = None
        self._persist()
        await self._publish(record)
        return record

    async def restore(self) -> None:
        """Re-activate the plugins that were active when the backend last stopped."""
        for name in list(self._settings.get(ACTIVE_KEY, [])):
            if name not in self._records:
                continue
            try:
                await self.activate(name)
            except PluginError:
                continue

    async def shutdown(self) -> None:
        """Mark active plugins stopped but keep ``plugins.active`` for the next start."""
        for name in reversed(list(self._active_order)):
            record = self._records.get(name)
            if record is None or record.state != "active":
                continue
            record.state = "stopped"
            await self._publish(record)
        self._active_order.clear()

    def _order(self, name: str) -> list[str]:
        order: list[str] = []
        stack: list[str] = []

        def visit(plugin_name: str) -> None:
            if plugin_name in order:
                return
            if plugin_name in stack:
                cycle = " -> ".join([*stack, plugin_name])
                raise PluginError(f"dependency cycle: {cycle}")
            record = self._require(plugin_name)
            stack.append(plugin_name)
            for dependency in record.manifest.requires if record.manifest else []:
                visit(dependency)
            stack.pop()
            order.append(plugin_name)

        visit(name)
        return order

    def _require(self, name: str) -> PluginRecord:
        record = self._records.get(name)
        if record is None:
            raise PluginNotFound(f"unknown plugin: {name}")
        return record

    def _persist(self) -> None:
        self._settings.set(ACTIVE_KEY, list(self._active_order))

    async def _publish(self, record: PluginRecord) -> None:
        await self._bus.publish("plugin.state", record.to_dict())


def _healthcheck(spec: HealthcheckSpec) -> Healthcheck:
    return Healthcheck(
        url=spec.url,
        timeout_s=spec.timeout_s,
        retries=spec.retries,
        delay_s=spec.delay_s,
    )
