from __future__ import annotations

from cotton.terminals.shell_input import compose_initial_input


def test_nothing_to_inject_returns_none() -> None:
    assert compose_initial_input(None, None) is None


def test_startup_alone_is_injected_as_is() -> None:
    assert compose_initial_input("source setup.bash", None) == "source setup.bash"


def test_body_alone_is_injected_as_is() -> None:
    assert compose_initial_input(None, "colcon build") == "colcon build"


def test_body_runs_only_after_a_successful_startup() -> None:
    assert (
        compose_initial_input("source setup.bash", "colcon build\nros2 launch demo")
        == "source setup.bash && {\ncolcon build\nros2 launch demo\n}"
    )
