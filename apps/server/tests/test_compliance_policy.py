from fastapi.testclient import TestClient

from app.main import app


def test_compliance_policy_is_public():
    with TestClient(app) as client:
        response = client.get("/compliance/policy")
        assert response.status_code == 200
        body = response.json()
        assert "company_name" in body
        assert "privacy_email" in body
        assert "terms_url" in body
        assert "privacy_url" in body
