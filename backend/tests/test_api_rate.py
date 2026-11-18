from __future__ import annotations

from fastapi.testclient import TestClient

from cotton.api.routes_topics import create_router
from cotton.app import create_app
from cotton.ros.rate import RateResult
from cotton.ros.thread import RosCallError
from cotton.services import Services


class StubRate:
    def __init__(self, result: RateResult | None = None, error: RosCallError | None = None) -> None:
        self.result = result or RateResult(available=True, hz=62.1, window_s=2.0)
        self.error = error
        self.calls: list[tuple[str, float]] = []

    def measure(self, topic: str, window_s: float = 2.0) -> RateResult:
        self.calls.append((topic, window_s))
        if self.error is not None:
            raise self.error
        return self.result


def client_for(services: Services, rate: StubRate) -> TestClient:
    services.routers.append(create_router(services.ros, rate))
    return TestClient(create_app(services))


def test_rate_returns_measurement(services: Services, auth_headers: dict[str, str]) -> None:
    with client_for(services, StubRate()) as client:
        response = client.get("/api/topics/%2Fchatter/rate", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {
        "available": True,
        "hz": 62.1,
        "window_s": 2.0,
        "reason": None,
    }


def test_rate_clamps_the_window(services: Services, auth_headers: dict[str, str]) -> None:
    rate = StubRate()

    with client_for(services, rate) as client:
        client.get("/api/topics/%2Fchatter/rate?window_s=10", headers=auth_headers)
        client.get("/api/topics/%2Fchatter/rate?window_s=0.1", headers=auth_headers)

    assert [window for _topic, window in rate.calls] == [5.0, 0.5]


def test_rate_of_unknown_topic_is_not_found(
    services: Services, auth_headers: dict[str, str]
) -> None:
    rate = StubRate(error=RosCallError("topic /ghost does not exist", code="topic_not_found"))

    with client_for(services, rate) as client:
        response = client.get("/api/topics/%2Fghost/rate", headers=auth_headers)

    assert response.status_code == 404
    assert response.json()["code"] == "topic_not_found"


def test_rate_requires_authentication(services: Services) -> None:
    with client_for(services, StubRate()) as client:
        response = client.get("/api/topics/%2Fchatter/rate")

    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"
