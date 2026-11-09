import json
from datetime import datetime, timezone
from pathlib import Path

from ros_studio.processes.logs import LogBuffer, LogFileWriter, parse_level
from ros_studio.processes.models import LogLine


def now() -> datetime:
    return datetime(2026, 11, 6, 12, 0, 0, tzinfo=timezone.utc)


def test_buffer_keeps_last_lines() -> None:
    buffer = LogBuffer(max_lines=3)

    for index in range(5):
        buffer.append("stdout", f"line {index}", now())

    assert [line.text for line in buffer.tail(10)] == ["line 2", "line 3", "line 4"]


def test_buffer_assigns_process_id_and_marks_stream() -> None:
    buffer = LogBuffer(process_id="p_1")

    line = buffer.append("stderr", "oops", now())

    assert line.id == "p_1"
    assert line.stream == "stderr"
    assert buffer.tail(1) == [line]


def test_parses_ros_log_level_prefix() -> None:
    assert parse_level("[WARN] [1720000000.1] [talker]: slow") == "warn"
    assert parse_level("[ERROR] boom") == "error"
    assert parse_level("[INFO] hello") == "info"
    assert parse_level("[DEBUG] detail") == "debug"
    assert parse_level("plain output") is None
    assert parse_level("[FATAL] unsupported") is None


def test_rotation_creates_numbered_backups(tmp_path: Path) -> None:
    path = tmp_path / "p.log"
    writer = LogFileWriter(path, max_bytes=120, backups=3)

    for index in range(12):
        writer.write(LogLine("p", "stdout", None, now(), f"{index}" + "x" * 30))

    assert path.exists()
    assert (tmp_path / "p.log.1").exists()
    assert (tmp_path / "p.log.2").exists()
    assert not (tmp_path / "p.log.4").exists()


def test_writer_stores_one_json_object_per_line(tmp_path: Path) -> None:
    path = tmp_path / "p.log"
    writer = LogFileWriter(path)

    writer.write(LogLine("p", "stdout", "info", now(), "hello"))

    assert json.loads(path.read_text().strip()) == {
        "id": "p",
        "stream": "stdout",
        "level": "info",
        "ts": "2026-11-06T12:00:00Z",
        "text": "hello",
    }
