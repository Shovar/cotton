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


def test_channel_matches_events() -> None:
    channel = Channel("logs:p1", matches=lambda event: event.data.get("id") == "p1")

    assert channel.matches(Event("process.log", {"id": "p1"}))
    assert not channel.matches(Event("process.log", {"id": "p2"}))
