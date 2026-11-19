from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Protocol

from cotton.events import Event


@dataclass(frozen=True)
class Channel:
    """A WebSocket subscription unit owned by one feature."""

    name: str
    matches: Callable[[Event], bool]
    initial: Callable[[], Awaitable[Sequence[Event]]] | None = None


class ChannelBuilder(Protocol):
    def __call__(self, name: str) -> Channel | None: ...


class ChannelRegistry:
    def __init__(self) -> None:
        self._channels: dict[str, Channel] = {}
        self._families: list[tuple[str, ChannelBuilder]] = []

    def register(self, channel: Channel) -> None:
        if channel.name in self._channels:
            raise ValueError(f"channel already registered: {channel.name}")
        self._channels[channel.name] = channel

    def register_family(self, prefix: str, build: ChannelBuilder) -> None:
        """Resolve dynamic channels such as ``terminal:<id>``; a None build means unknown."""
        self._families.append((prefix, build))

    def get(self, name: str) -> Channel | None:
        channel = self._channels.get(name)
        if channel is not None:
            return channel
        for prefix, build in self._families:
            if name.startswith(prefix):
                return build(name)
        return None

    def names(self) -> tuple[str, ...]:
        return tuple(sorted(self._channels))
