import json
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest

from cotton.terminals.models import TerminalChunk, TerminalRecord, TerminalSpec, TerminalState


@pytest.mark.parametrize(
    ("state", "value"),
    [
        (TerminalState.STARTING, "starting"),
        (TerminalState.RUNNING, "running"),
        (TerminalState.EXITED, "exited"),
        (TerminalState.FAILED, "failed"),
    ],
)
def test_terminal_record_serializes_each_lifecycle_state(state: TerminalState, value: str) -> None:
    record = TerminalRecord(
        spec=TerminalSpec(
            id="t_0123456789abcdef",
            kind="command",
            argv=("python", "-c", "print('hi')"),
            cwd=Path("/workspace"),
            env={"ROS_DOMAIN_ID": "7"},
            workspace_id="ws_test",
            group_id="grp_test",
        ),
        state=state,
        pid=4242,
        started_at="2026-11-18T10:00:00Z",
        exit_code=None,
        error=None,
    )

    assert record.to_dict()["state"] == value


def test_terminal_record_has_stable_json_contract_shape() -> None:
    record = TerminalRecord(
        spec=TerminalSpec(
            id="t_0123456789abcdef",
            kind="command",
            argv=("echo", "hello"),
            cwd=Path("/workspace"),
            env={"ROS_DOMAIN_ID": "7"},
            workspace_id="ws_test",
            group_id="grp_test",
        ),
        state=TerminalState.RUNNING,
        pid=4242,
        started_at="2026-11-18T10:00:00Z",
        exit_code=None,
        error=None,
    )

    assert json.dumps(record.to_dict(), separators=(",", ":"), sort_keys=True) == (
        '{"error":null,"exit_code":null,"pid":4242,'
        '"spec":{"argv":["echo","hello"],"cwd":"/workspace",'
        '"env":{"ROS_DOMAIN_ID":"7"},"group_id":"grp_test","id":"t_0123456789abcdef",'
        '"kind":"command","workspace_id":"ws_test"},"started_at":"2026-11-18T10:00:00Z",'
        '"state":"running"}'
    )


def test_terminal_spec_copies_argv_and_freezes_environment() -> None:
    argv = ("echo", "hello")
    env = {"ROS_DOMAIN_ID": "7"}
    spec = TerminalSpec(
        id="t_0123456789abcdef",
        kind="command",
        argv=argv,
        cwd=Path("/workspace"),
        env=env,
        workspace_id="ws_test",
        group_id="grp_test",
    )

    env["ROS_DOMAIN_ID"] = "9"

    assert spec.argv == ("echo", "hello")
    assert spec.env == {"ROS_DOMAIN_ID": "7"}
    with pytest.raises(TypeError):
        spec.env["ROS_DOMAIN_ID"] = "9"  # type: ignore[index]
    with pytest.raises(FrozenInstanceError):
        spec.id = "t_changed"


def test_terminal_chunk_preserves_sequence_and_binary_output() -> None:
    chunk = TerminalChunk(sequence=12, data=b"\x00\xffterminal")

    assert chunk.sequence == 12
    assert chunk.data == b"\x00\xffterminal"
