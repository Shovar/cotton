import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

TOKEN = "test-token"
ORIGIN = "http://testserver"


def test_rest_requires_bearer(client: TestClient) -> None:
    assert client.get("/api/env").status_code == 401


def test_rest_rejects_wrong_token(client: TestClient) -> None:
    response = client.get("/api/env", headers={"Authorization": "Bearer wrong"})
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"


def test_rest_accepts_valid_token(client: TestClient, auth_headers: dict[str, str]) -> None:
    assert client.get("/api/env", headers=auth_headers).status_code == 200


def test_health_is_open(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ws_rejects_bad_origin(client: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/ws?token={TOKEN}", headers={"origin": "http://evil.test"}):
            pass
    assert exc.value.code == 1008


def test_ws_rejects_bad_token(client: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws?token=wrong", headers={"origin": ORIGIN}):
            pass
    assert exc.value.code == 1008


def test_ws_rejects_missing_origin(client: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/ws?token={TOKEN}"):
            pass
    assert exc.value.code == 1008


def test_cors_rejects_unknown_origin(client: TestClient) -> None:
    response = client.options(
        "/api/env",
        headers={"Origin": "http://evil.test", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in response.headers


def test_cors_allows_known_origin(client: TestClient) -> None:
    response = client.options(
        "/api/env",
        headers={"Origin": ORIGIN, "Access-Control-Request-Method": "GET"},
    )
    assert response.headers["access-control-allow-origin"] == ORIGIN
