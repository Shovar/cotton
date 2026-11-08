import pytest

from ros_studio import cli
from ros_studio.env import EnvironmentInfo, RosEnvironmentError


def environment() -> EnvironmentInfo:
    return EnvironmentInfo(
        distro="jazzy",
        domain_id=0,
        rmw=None,
        workspace=None,
        ros_version="2",
        app_version="0.1.0",
    )


def test_parse_defaults() -> None:
    args = cli.parse_args([])
    assert (args.host, args.port, args.no_browser) == ("127.0.0.1", 8000, False)


def test_parse_overrides() -> None:
    args = cli.parse_args(["--host", "0.0.0.0", "--port", "9000", "--no-browser"])
    assert (args.host, args.port, args.no_browser) == ("0.0.0.0", 9000, True)


def test_main_reports_missing_environment(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def fail() -> EnvironmentInfo:
        raise RosEnvironmentError("ROS_DISTRO is not set")

    monkeypatch.setattr(cli, "ensure_ros_environment", fail)
    assert cli.main([]) == 2
    assert "ROS_DISTRO" in capsys.readouterr().err


def test_main_runs_uvicorn_with_parsed_options(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: dict[str, object] = {}

    def run(app: object, host: str, port: int) -> None:
        calls.update(app=app, host=host, port=port)

    monkeypatch.setattr(cli, "ensure_ros_environment", environment)
    monkeypatch.setattr(cli.uvicorn, "run", run)
    assert cli.main(["--host", "0.0.0.0", "--port", "9000", "--no-browser"]) == 0
    assert (calls["host"], calls["port"]) == ("0.0.0.0", 9000)
