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


def test_default_origins_cover_loopback_and_extra() -> None:
    origins = cli.allowed_origins(8000, ["http://dev.test:5173"])
    assert "http://127.0.0.1:8000" in origins
    assert "http://localhost:8000" in origins
    assert "http://dev.test:5173" in origins


def test_browser_url_uses_loopback_for_wildcard_hosts() -> None:
    assert cli.browser_url("0.0.0.0", 8000, "abc") == "http://127.0.0.1:8000/#token=abc"
    assert cli.browser_url("localhost", 9000, "abc") == "http://localhost:9000/#token=abc"


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

    def run(app: object, host: str, port: int, **_kwargs: object) -> None:
        calls.update(app=app, host=host, port=port)

    monkeypatch.setattr(cli, "ensure_ros_environment", environment)
    monkeypatch.setattr(cli.uvicorn, "run", run)
    assert cli.main(["--host", "0.0.0.0", "--port", "9000", "--no-browser"]) == 0
    assert (calls["host"], calls["port"]) == ("0.0.0.0", 9000)
    services = calls["app"].state.services  # type: ignore[attr-defined]
    assert services.auth.token
    assert "http://127.0.0.1:9000" in services.auth.allowed_origins


def test_main_opens_browser_with_fixed_token(monkeypatch: pytest.MonkeyPatch) -> None:
    opened: dict[str, str] = {}

    class ImmediateTimer:
        def __init__(self, _delay: float, fn: object, args: tuple[str, ...]) -> None:
            self.fn = fn
            self.args = args
            self.daemon = False

        def start(self) -> None:
            self.fn(*self.args)  # type: ignore[operator]

    monkeypatch.setattr(cli, "ensure_ros_environment", environment)
    monkeypatch.setattr(cli.uvicorn, "run", lambda *args, **kwargs: None)
    monkeypatch.setattr(cli.threading, "Timer", ImmediateTimer)
    monkeypatch.setattr(cli.webbrowser, "open", lambda url: opened.setdefault("url", url))

    assert cli.main(["--port", "9000", "--token", "fixed"]) == 0
    assert opened["url"] == "http://127.0.0.1:9000/#token=fixed"


def test_main_disables_uvicorn_access_log(monkeypatch: pytest.MonkeyPatch) -> None:
    options: dict[str, object] = {}

    def run(*_args: object, **kwargs: object) -> None:
        options.update(kwargs)

    monkeypatch.setattr(cli, "ensure_ros_environment", environment)
    monkeypatch.setattr(cli.uvicorn, "run", run)

    assert cli.main(["--no-browser"]) == 0
    assert options["access_log"] is False
