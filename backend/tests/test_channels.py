import pytest

from ros_studio.channels import Channel, ChannelRegistry
from ros_studio.events import Event


def test_registry_resolves_registered_channels() -> None:
    registry = ChannelRegistry()
    channel = Channel("graph", matches=lambda event: event.type == "graph.update")

    registry.register(channel)

    assert registry.get("graph") is channel
    assert registry.names() == ("graph",)


def test_registry_rejects_duplicate_names() -> None:
    registry = ChannelRegistry()
    registry.register(Channel("graph", matches=lambda event: True))

    with pytest.raises(ValueError, match="graph"):
        registry.register(Channel("graph", matches=lambda event: True))


def test_registry_resolves_channel_families() -> None:
    registry = ChannelRegistry()

    def build(name: str) -> Channel | None:
        return Channel(name, matches=lambda event: True) if name != "logs:nope" else None

    registry.register_family("logs:", build)

    assert registry.get("logs:p1") is not None
    assert registry.get("logs:nope") is None
    assert registry.get("other") is None
    assert registry.names() == ()


def test_channel_matches_events() -> None:
    channel = Channel("logs:p1", matches=lambda event: event.data.get("id") == "p1")

    assert channel.matches(Event("process.log", {"id": "p1"}))
    assert not channel.matches(Event("process.log", {"id": "p2"}))
