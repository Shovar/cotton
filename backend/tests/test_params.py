from __future__ import annotations

import pytest

from ros_studio.ros.params import coerce_value


@pytest.mark.parametrize(
    ("current", "new", "expected"),
    [
        (True, False, ("bool", False)),
        (3, 4, ("integer", 4)),
        (1.5, 2, ("double", 2.0)),
        (1.5, "2.5", ("double", 2.5)),
        ("a", "b", ("string", "b")),
        ([1, 2], [3], ("integer_array", [3])),
        ([1.5], [2], ("double_array", [2.0])),
        (["a"], ["b"], ("string_array", ["b"])),
        ([True], [False], ("bool_array", [False])),
        (b"\x01", [2], ("byte_array", b"\x02")),
        ([], [1], ("integer_array", [1])),
    ],
)
def test_coerce_keeps_declared_type(
    current: object, new: object, expected: tuple[str, object]
) -> None:
    assert coerce_value(current, new) == expected


def test_coerce_rejects_incompatible_value() -> None:
    with pytest.raises(ValueError, match="bool"):
        assert coerce_value(True, "no")


@pytest.mark.parametrize(
    ("current", "new"),
    [(3, "four"), (3, 4.5), (1.5, True), ("a", 1), ([1], "1")],
)
def test_coerce_names_the_expected_type(current: object, new: object) -> None:
    with pytest.raises(ValueError, match="expected"):
        assert coerce_value(current, new)
