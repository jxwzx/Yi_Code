import time

import pytest
from fastapi.testclient import TestClient

from services.local_api.main import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def bearer(token: str):
    return {"Authorization": f"Bearer {token}"}


def unique_username():
    return f"pytest_{time.time_ns() % 10000000}"


def test_login_returns_jwt(client: TestClient):
    resp = client.post(
        "/auth/login",
        json={"username": "编程学习者", "password": "123456"},
    )
    assert resp.status_code == 200
    token = resp.json().get("token", "")
    assert len(token.split(".")) == 3


def test_tampered_jwt_rejected(client: TestClient):
    resp = client.post(
        "/auth/login",
        json={"username": "编程学习者", "password": "123456"},
    )
    token = resp.json().get("token", "")
    head, payload, signature = token.split(".")
    replacement = "A" if signature[0] != "A" else "B"
    tampered = f"{head}.{payload}.{replacement}{signature[1:]}"
    admin = client.get("/admin/users", headers=bearer(tampered))
    assert admin.status_code == 401


def test_register_returns_token_and_cleanup(client: TestClient):
    username = unique_username()
    resp = client.post(
        "/auth/register",
        json={"username": username, "password": "SecurePass123!"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("token")
    assert data.get("user_id")

    admin = client.post(
        "/auth/login",
        json={"username": "编程学习者", "password": "123456"},
    ).json()
    delete = client.delete(
        f"/admin/users/{data['user_id']}",
        headers=bearer(admin["token"]),
    )
    assert delete.status_code == 200


def test_register_rejects_short_password(client: TestClient):
    resp = client.post(
        "/auth/register",
        json={"username": unique_username(), "password": "123"},
    )
    assert resp.status_code == 400


def test_student_cannot_escalate_role(client: TestClient):
    admin = client.post(
        "/auth/login",
        json={"username": "编程学习者", "password": "123456"},
    ).json()
    reg = client.post(
        "/auth/register",
        json={"username": unique_username(), "password": "SecurePass123!"},
    )
    assert reg.status_code == 200
    student = reg.json()
    try:
        resp = client.post(
            f"/admin/users/{student['user_id']}/role?role=super_admin",
            headers=bearer(student["token"]),
        )
        assert resp.status_code == 403
    finally:
        client.delete(
            f"/admin/users/{student['user_id']}",
            headers=bearer(admin["token"]),
        )


def test_admin_endpoints_require_auth(client: TestClient):
    no_auth = client.get("/admin/users")
    assert no_auth.status_code == 401

    invalid = client.get("/admin/users", headers=bearer("bad.token"))
    assert invalid.status_code == 401

    admin = client.post(
        "/auth/login",
        json={"username": "编程学习者", "password": "123456"},
    ).json()
    ok = client.get("/admin/users", headers=bearer(admin["token"]))
    assert ok.status_code == 200
    assert len(ok.json().get("users", [])) > 0


def test_user_cannot_read_other_user_data(client: TestClient):
    admin = client.post(
        "/auth/login",
        json={"username": "编程学习者", "password": "123456"},
    ).json()

    username = unique_username()
    reg = client.post(
        "/auth/register",
        json={"username": username, "password": "SecurePass123!"},
    )
    assert reg.status_code == 200
    student = reg.json()

    try:
        assert client.get(f"/users/{student['user_id']}").status_code == 401
        assert client.get(
            f"/users/1", headers=bearer(student["token"])
        ).status_code == 403
        assert client.get(
            f"/users/1/dashboard", headers=bearer(student["token"])
        ).status_code == 403
        assert client.get(
            f"/users/{student['user_id']}/dashboard",
            headers=bearer(student["token"]),
        ).status_code == 200
    finally:
        client.delete(
            f"/admin/users/{student['user_id']}",
            headers=bearer(admin["token"]),
        )
