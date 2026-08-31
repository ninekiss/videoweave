from fastapi.testclient import TestClient

from videoweave_api.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_capabilities() -> None:
    response = client.get("/v1/capabilities")
    assert response.status_code == 200
    assert "video-replication" in response.json()["capabilities"]
