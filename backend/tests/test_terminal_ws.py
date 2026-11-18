from __future__ import annotations

import asyncio
import base64
import time
from collections.abc import Sequence
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from cotton.api.routes_terminals import register_terminal_channels
from cotton.app import create_app
from cotton.services import Services
from cotton.terminals.manager import TerminalManager
from cotton.terminals.ports import PtySession

TOKEN = "test-token"
ORIGIN = "http://testserver"


class FakePtySession:
    def __init__(self) -> None:
        self.pid = 4242
        self.output: asyncio.Queue[bytes | None] = asyncio.Queue()
        self.inputs: list[bytes] = []
        self.resizes: list[tuple[int, int]] = []
        self.closed = False

    async def read(self) -> bytes | None:
        return await self.output.get()

    async def write(self, data: bytes) -> None:
        self.inputs.append(data)

    async def resize(self, cols: int, rows: int) -> None:
        self.resizes.append((cols, rows))

    def has_foreground_job(self) -> bool:
        return False

    async def close(self) -> int:
        self.closed = True
        self.output.put_nowait(None)
        return 0

    async def emit(self, data: bytes) -> None:
        self.output.put_nowait(data)


class FakePtySpawner:
    def __init__(self, session: FakePtySession) -> None:
        self.session = session

    async def spawn(self, argv: Sequence[str], cwd: Path, env: dict[str, str]) -> PtySession:
        return self.session


def build_terminal(
    services: Services, session: FakePtySession
) -> tuple[TerminalManager, TestClient]:
    manager = TerminalManager(services.bus, FakePtySpawner(session))
    services.terminal_manager = manager
    register_terminal_channels(services.channels, manager)
    services.shutdown.append(manager.shutdown)
    client = TestClient(create_app(services))
    return manager, client


def wait_for_output(client: TestClient, manager: TerminalManager, terminal_id: str) -> None:
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        if client.portal.call(manager.output_since, terminal_id, 0):
            return
        time.sleep(0.01)
    raise AssertionError("terminal output was not retained")


def test_attach_replays_output_and_detach_stops_control(
    services: Services,
) -> None:
    session = FakePtySession()
    manager, client = build_terminal(services, session)
    with client:
        record = client.portal.call(manager.start, ["command"])
        client.portal.call(session.emit, b"before")
        wait_for_output(client, manager, record.spec.id)
        with client.websocket_connect(
            f"/ws?token={TOKEN}", headers={"origin": ORIGIN}
        ) as websocket:
            websocket.send_json(
                {
                    "type": "terminal.attach",
                    "data": {"id": record.spec.id, "after_sequence": 0},
                }
            )
            state = websocket.receive_json()
            replay = websocket.receive_json()
            websocket.send_json({"type": "terminal.detach", "data": {"id": record.spec.id}})
            websocket.send_json(
                {
                    "type": "terminal.input",
                    "data": {"id": record.spec.id, "data": base64.b64encode(b"x").decode()},
                }
            )
            detached_error = websocket.receive_json()
        assert not session.closed

    assert state["type"] == "terminal.state"
    assert replay == {
        "type": "terminal.output",
        "data": {"id": record.spec.id, "sequence": 1, "data": base64.b64encode(b"before").decode()},
    }
    assert detached_error["data"]["code"] == "terminal_not_attached"
    assert session.inputs == []


def test_attach_replay_orders_output_that_arrives_during_replay(
    services: Services, monkeypatch: pytest.MonkeyPatch
) -> None:
    session = FakePtySession()
    manager, client = build_terminal(services, session)
    original_output_since = manager.output_since
    schedule_output = False

    def output_since(terminal_id: str, sequence: int):
        nonlocal schedule_output
        chunks = original_output_since(terminal_id, sequence)
        if schedule_output:
            schedule_output = False
            asyncio.get_running_loop().create_task(
                services.bus.publish(
                    "terminal.output",
                    {
                        "id": terminal_id,
                        "sequence": 1,
                        "data": base64.b64encode(b"before").decode(),
                    },
                )
            )
            asyncio.get_running_loop().call_soon(session.output.put_nowait, b"during replay")
        return chunks

    monkeypatch.setattr(manager, "output_since", output_since)
    with client:
        record = client.portal.call(manager.start, ["command"])
        client.portal.call(session.emit, b"before")
        wait_for_output(client, manager, record.spec.id)
        with client.websocket_connect(
            f"/ws?token={TOKEN}", headers={"origin": ORIGIN}
        ) as websocket:
            schedule_output = True
            websocket.send_json(
                {
                    "type": "terminal.attach",
                    "data": {"id": record.spec.id, "after_sequence": 0},
                }
            )
            state = websocket.receive_json()
            client.portal.call(session.emit, b"during replay")
            wait_for_output(client, manager, record.spec.id)
            replay, live = websocket.receive_json(), websocket.receive_json()

    assert state["type"] == "terminal.state"
    assert [event["data"]["sequence"] for event in (replay, live)] == [1, 2]
    assert [base64.b64decode(event["data"]["data"]) for event in (replay, live)] == [
        b"before",
        b"during replay",
    ]


def test_attach_with_future_sequence_still_forwards_live_output(
    services: Services,
) -> None:
    session = FakePtySession()
    manager, client = build_terminal(services, session)
    with client:
        record = client.portal.call(manager.start, ["command"])
        with client.websocket_connect(
            f"/ws?token={TOKEN}", headers={"origin": ORIGIN}
        ) as websocket:
            websocket.send_json(
                {
                    "type": "terminal.attach",
                    "data": {"id": record.spec.id, "after_sequence": 100},
                }
            )
            websocket.receive_json()
            client.portal.call(session.emit, b"live")
            wait_for_output(client, manager, record.spec.id)
            client.portal.call(asyncio.sleep, 0.05)
            websocket.send_json(
                {
                    "type": "terminal.resize",
                    "data": {"id": record.spec.id, "cols": 0, "rows": 24},
                }
            )
            output = websocket.receive_json()

    assert output == {
        "type": "terminal.output",
        "data": {"id": record.spec.id, "sequence": 1, "data": base64.b64encode(b"live").decode()},
    }


def test_terminals_subscription_backfills_known_sessions(services: Services) -> None:
    manager, client = build_terminal(services, FakePtySession())
    with client:
        record = client.portal.call(manager.start, ["command"])
        with client.websocket_connect(
            f"/ws?token={TOKEN}", headers={"origin": ORIGIN}
        ) as websocket:
            websocket.send_json({"type": "subscribe", "channels": ["terminals"]})
            state = websocket.receive_json()

    assert state == {"type": "terminal.state", "data": record.to_dict()}


def test_terminal_session_requires_attach_instead_of_direct_subscription(
    services: Services,
) -> None:
    manager, client = build_terminal(services, FakePtySession())
    with client:
        record = client.portal.call(manager.start, ["command"])
        with client.websocket_connect(
            f"/ws?token={TOKEN}", headers={"origin": ORIGIN}
        ) as websocket:
            websocket.send_json({"type": "subscribe", "channels": [f"terminal:{record.spec.id}"]})
            response = websocket.receive_json()

    assert response["data"]["code"] == "terminal_attach_required"


def test_attached_client_can_send_input_and_resize(
    services: Services,
) -> None:
    session = FakePtySession()
    manager, client = build_terminal(services, session)
    with client:
        record = client.portal.call(manager.start, ["command"])
        with client.websocket_connect(
            f"/ws?token={TOKEN}", headers={"origin": ORIGIN}
        ) as websocket:
            websocket.send_json(
                {
                    "type": "terminal.attach",
                    "data": {"id": record.spec.id, "after_sequence": 0},
                }
            )
            websocket.receive_json()
            websocket.send_json(
                {
                    "type": "terminal.input",
                    "data": {
                        "id": record.spec.id,
                        "data": base64.b64encode(b"typed").decode(),
                    },
                }
            )
            websocket.send_json(
                {
                    "type": "terminal.resize",
                    "data": {"id": record.spec.id, "cols": 90, "rows": 30},
                }
            )
            websocket.send_json(
                {
                    "type": "terminal.input",
                    "data": {"id": record.spec.id, "data": "%"},
                }
            )
            error = websocket.receive_json()

    assert error["data"]["code"] == "invalid_terminal_payload"
    assert session.inputs == [b"typed"]
    assert session.resizes == [(90, 30)]


def test_two_authorized_clients_can_attach_to_same_session(
    services: Services,
) -> None:
    session = FakePtySession()
    manager, client = build_terminal(services, session)
    with client:
        record = client.portal.call(manager.start, ["command"])
        with client.websocket_connect(f"/ws?token={TOKEN}", headers={"origin": ORIGIN}) as first:
            first.send_json(
                {
                    "type": "terminal.attach",
                    "data": {"id": record.spec.id, "after_sequence": 0},
                }
            )
            first.receive_json()
            with client.websocket_connect(
                f"/ws?token={TOKEN}", headers={"origin": ORIGIN}
            ) as second:
                second.send_json(
                    {
                        "type": "terminal.attach",
                        "data": {"id": record.spec.id, "after_sequence": 0},
                    }
                )
                second.receive_json()
                client.portal.call(session.emit, b"shared")
                wait_for_output(client, manager, record.spec.id)
                first_output = first.receive_json()
                second_output = second.receive_json()

    assert first_output["type"] == "terminal.output"
    assert second_output["type"] == "terminal.output"
    assert first_output["data"]["data"] == base64.b64encode(b"shared").decode()
    assert second_output["data"]["data"] == base64.b64encode(b"shared").decode()


def test_terminal_controls_reject_unknown_and_unattached_sessions(
    services: Services,
) -> None:
    session = FakePtySession()
    manager, client = build_terminal(services, session)
    with client:
        client.portal.call(manager.start, ["command"])
        with client.websocket_connect(
            f"/ws?token={TOKEN}", headers={"origin": ORIGIN}
        ) as websocket:
            websocket.send_json(
                {
                    "type": "terminal.attach",
                    "data": {"id": "missing", "after_sequence": 0},
                }
            )
            unknown = websocket.receive_json()
            websocket.send_json(
                {
                    "type": "terminal.resize",
                    "data": {"id": "missing", "cols": 80, "rows": 24},
                }
            )
            unattached = websocket.receive_json()

    assert unknown["data"]["code"] == "terminal_not_found"
    assert unattached["data"]["code"] == "terminal_not_attached"
    assert session.resizes == []


@pytest.mark.parametrize(
    ("token", "headers"),
    [
        ("wrong", {"origin": ORIGIN}),
        (TOKEN, {"origin": "http://evil.test"}),
        (TOKEN, {}),
    ],
)
def test_terminal_output_requires_valid_token_and_origin(
    services: Services, token: str, headers: dict[str, str]
) -> None:
    manager, client = build_terminal(services, FakePtySession())
    with client:
        client.portal.call(manager.start, ["command"])
        with pytest.raises(WebSocketDisconnect) as error:
            with client.websocket_connect(f"/ws?token={token}", headers=headers):
                pass

    assert error.value.code == 1008
