from datetime import datetime, timezone

from cotton.processes.models import LogLine, ProcessRecord, ProcessSpec


def started_at() -> datetime:
    return datetime(2026, 11, 6, 12, 0, 0, tzinfo=timezone.utc)


def test_process_spec_roundtrips_through_json_dict() -> None:
    spec = ProcessSpec(
        id="p_1a2b3c4d",
        argv=["ros2", "launch", "demo_nodes_cpp"],
        cwd="/ws",
        env={"ROS_DOMAIN_ID": "7"},
        plugin="foxglove",
        autostart=True,
    )

    assert spec.to_dict() == {
        "id": "p_1a2b3c4d",
        "argv": ["ros2", "launch", "demo_nodes_cpp"],
        "cwd": "/ws",
        "env": {"ROS_DOMAIN_ID": "7"},
        "plugin": "foxglove",
        "autostart": True,
    }
    assert ProcessSpec.from_dict(spec.to_dict()) == spec


def test_process_record_serializes_contract_shape() -> None:
    spec = ProcessSpec(id="p_1", argv=["sleep", "30"])
    record = ProcessRecord(
        id="p_1",
        spec=spec,
        state="failed",
        pid=4242,
        pgid=4242,
        started_at=started_at(),
        exit_code=3,
        error="boom",
        recovered=True,
    )

    assert record.to_dict() == {
        "id": "p_1",
        "spec": spec.to_dict(),
        "state": "failed",
        "pid": 4242,
        "pgid": 4242,
        "started_at": "2026-11-06T12:00:00Z",
        "exit_code": 3,
        "error": "boom",
        "recovered": True,
    }


def test_log_line_serializes_contract_shape() -> None:
    line = LogLine(
        id="p_1",
        stream="stderr",
        level="warn",
        ts=started_at(),
        text="[WARN] [talker]: slow",
    )

    assert line.to_dict() == {
        "id": "p_1",
        "stream": "stderr",
        "level": "warn",
        "ts": "2026-11-06T12:00:00Z",
        "text": "[WARN] [talker]: slow",
    }
