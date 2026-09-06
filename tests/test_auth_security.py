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


def test_runtime_and_admin_endpoints_require_auth(client: TestClient):
    assert client.post("/run", json={"language": "py", "code": "print(1)"}).status_code == 401
    assert client.get("/tasks").status_code == 401
    assert client.get("/ai/history").status_code == 401
    assert client.post("/install/java").status_code == 401
    assert client.post("/courses", json={"title": "x", "language": "py"}).status_code == 401
    assert client.post("/exercises", json={"title": "x", "language": "py"}).status_code == 401


def test_student_cannot_publish_or_install(client: TestClient):
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
        auth = bearer(student["token"])
        assert client.post("/install/java", headers=auth).status_code == 403
        assert client.post("/courses", json={"title": "x", "language": "py"}, headers=auth).status_code == 403
        assert client.post("/exercises", json={"title": "x", "language": "py"}, headers=auth).status_code == 403
    finally:
        client.delete(
            f"/admin/users/{student['user_id']}",
            headers=bearer(admin["token"]),
        )


def test_run_history_is_isolated_per_user(client: TestClient):
    admin = client.post(
        "/auth/login",
        json={"username": "编程学习者", "password": "123456"},
    ).json()
    auth = bearer(admin["token"])
    result = client.post(
        "/run",
        headers=auth,
        json={"language": "py", "code": "print('isolated')"},
    ).json()
    tasks = client.get("/tasks", headers=auth).json()
    assert any(t.get("task_id") == result.get("task_id") for t in tasks.get("tasks", []))
    assert all(t.get("owner_username") == "编程学习者" for t in tasks.get("tasks", []))


def test_register_rejects_empty_username(client: TestClient):
    resp = client.post(
        "/auth/register",
        json={"username": "", "password": "SecurePass123!"},
    )
    assert resp.status_code == 400


def test_course_count_matches_rows(client: TestClient):
    data = client.get("/courses").json()
    assert data["count"] == len(data["courses"])


def test_room_websocket_accepts_token_in_first_message(client: TestClient):
    admin = client.post(
        "/auth/login",
        json={"username": "编程学习者", "password": "123456"},
    ).json()
    auth = bearer(admin["token"])
    room = client.post("/rooms", headers=auth, json={"host_name": "编程学习者"}).json()
    room_code = room["room_code"]
    try:
        with client.websocket_connect(f"/ws/room/{room_code}") as ws:
            ws.send_json({
                "token": admin["token"],
                "name": "编程学习者",
                "role": "writer",
                "color": "a",
            })
            state = ws.receive_json()
            assert state["type"] == "room_state"
            assert state["host"] == "编程学习者"
    finally:
        client.delete(f"/rooms/{room_code}", headers=auth)


def test_install_status_requires_auth(client: TestClient):
    assert client.get("/install/status/any-task").status_code == 401


def test_run_input_limits(client: TestClient):
    admin = client.post(
        "/auth/login",
        json={"username": "编程学习者", "password": "123456"},
    ).json()
    auth = bearer(admin["token"])
    oversized = client.post(
        "/run",
        headers=auth,
        json={"language": "py", "code": "x" * 200_001},
    )
    assert oversized.status_code == 422
    long_timeout = client.post(
        "/run",
        headers=auth,
        json={"language": "py", "code": "print(1)", "timeout": 61},
    )
    assert long_timeout.status_code == 422
