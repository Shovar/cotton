import pytest

from ros_studio.errors import ApiError
from ros_studio.security import Auth, generate_token

ORIGIN = "http://127.0.0.1:8000"


def auth() -> Auth:
    return Auth("secret-token", {ORIGIN})


def test_token_generation_is_random() -> None:
    assert len(generate_token()) >= 32
    assert generate_token() != generate_token()


def test_bearer_accepts_correct_token() -> None:
    auth().check_bearer("Bearer secret-token")


@pytest.mark.parametrize(
    "header",
    [None, "", "secret-token", "Basic secret-token", "Bearer wrong", "Bearer "],
)
def test_bearer_rejects_bad_tokens(header: str | None) -> None:
    with pytest.raises(ApiError) as exc:
        auth().check_bearer(header)
    assert (exc.value.status, exc.value.code) == (401, "unauthorized")


def test_ws_accepts_allowed_origin_and_token() -> None:
    auth().check_ws("secret-token", ORIGIN)


def test_ws_rejects_unknown_origin() -> None:
    with pytest.raises(ApiError) as exc:
        auth().check_ws("secret-token", "http://evil.test")
    assert (exc.value.status, exc.value.code) == (403, "forbidden_origin")


def test_ws_rejects_missing_origin() -> None:
    with pytest.raises(ApiError) as exc:
        auth().check_ws("secret-token", None)
    assert exc.value.code == "forbidden_origin"


@pytest.mark.parametrize("token", [None, "", "wrong"])
def test_ws_rejects_bad_token(token: str | None) -> None:
    with pytest.raises(ApiError) as exc:
        auth().check_ws(token, ORIGIN)
    assert (exc.value.status, exc.value.code) == (401, "unauthorized")
