from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass

from ros_studio.events import Event


@dataclass(frozen=True)
class Channel:
    """A WebSocket subscription unit owned by one feature."""

    name: str
    matches: Callable[[Event], bool]
    initial: Callable[[], Awaitable[Sequence[Event]]] | None = None


class ChannelRegistry:
    def __init__(self) -> None:
        self._channels: dict[str, Channel] = {}

    def register(self, channel: Channel) -> None:
        if channel.name in self._channels:
            raise ValueError(f"channel already registered: {channel.name}")
        self._channels[channel.name] = channel

    def get(self, name: str) -> Channel | None:
        return self._channels.get(name)

    def names(self) -> tuple[str, ...]:
        return tuple(sorted(self._channels))
