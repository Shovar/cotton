from ros_studio.events import EventBus


async def test_bus_fans_out() -> None:
    bus = EventBus()
    first, second = bus.subscribe(), bus.subscribe()

    await bus.publish("graph.update", {"revision": 1})

    assert (await first.get()).data == {"revision": 1}
    assert (await second.get()).type == "graph.update"


async def test_unsubscribe_stops_delivery() -> None:
    bus = EventBus()
    queue = bus.subscribe()
    bus.unsubscribe(queue)

    await bus.publish("graph.update", {})

    assert queue.empty()


async def test_publish_without_subscribers_does_not_block() -> None:
    await EventBus().publish("process.state", {"id": "p1"})
