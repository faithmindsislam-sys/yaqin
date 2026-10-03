import asyncio

import pytest

from app.auth import User, current_user
from app.db import get_store
from app.main import app

ACTOR = "00000000-0000-0000-0000-000000000001"
TARGET = "00000000-0000-0000-0000-000000000002"


@pytest.fixture
def admin_client(client):
    store = get_store()
    store.users = {
        ACTOR: {"id": ACTOR, "email": "owner@example.test", "display_name": "Owner", "role": "super_admin", "created_at": "2026-10-01T00:00:00Z"},
        TARGET: {"id": TARGET, "email": "staff@example.test", "display_name": "Future Teacher", "role": "learner", "created_at": "2026-10-02T00:00:00Z"},
    }
    app.dependency_overrides[current_user] = lambda: User(id=ACTOR, role="super_admin")
    yield client
    app.dependency_overrides.clear()


@pytest.mark.parametrize("role", ["learner", "teacher", "admin"])
def test_only_super_admin_can_manage_users(admin_client, role):
    app.dependency_overrides[current_user] = lambda: User(id=ACTOR, role=role)
    assert admin_client.get("/api/admin/users").status_code == 403
    assert admin_client.post(f"/api/admin/users/{TARGET}/role", json={"role": "teacher"}).status_code == 403
    assert get_store().admin_events == []
    assert get_store().users[TARGET]["role"] == "learner"


@pytest.mark.parametrize("role", ["learner", "teacher", "admin", "super_admin"])
def test_super_admin_changes_role_and_writes_audit(admin_client, role):
    result = admin_client.post(f"/api/admin/users/{TARGET}/role", json={"role": role})
    assert result.status_code == 200
    assert result.json() == {"id": TARGET, "role": role}
    store = get_store()
    assert asyncio.run(store.get_role(TARGET)) == role
    assert len(store.admin_events) == 1
    event = store.admin_events[0]
    assert event["actor_id"] == ACTOR and event["target_id"] == TARGET
    assert event["kind"] == "role_changed"
    assert event["payload"] == {"from_role": "learner", "to_role": role}
    assert event["id"] and event["created_at"]


@pytest.mark.parametrize("uid, role, status", [(ACTOR, "learner", 403), (ACTOR.upper(), "admin", 403),
                                             (TARGET, "instructor", 400), (TARGET, "unknown", 400),
                                             ("bad-id", "teacher", 400),
                                             ("00000000-0000-0000-0000-000000000099", "teacher", 404)])
def test_invalid_changes_do_not_mutate_or_audit(admin_client, uid, role, status):
    assert admin_client.post(f"/api/admin/users/{uid}/role", json={"role": role}).status_code == status
    assert get_store().users[TARGET]["role"] == "learner"
    assert get_store().users[ACTOR]["role"] == "super_admin"
    assert get_store().admin_events == []


def test_role_change_requires_real_user(admin_client):
    app.dependency_overrides[current_user] = lambda: User(id=None, role="super_admin")
    assert admin_client.post(f"/api/admin/users/{TARGET}/role", json={"role": "teacher"}).status_code == 401
    assert get_store().admin_events == []


def test_search_email_name_and_limit(admin_client):
    for query in ("STAFF@", " Teacher "):
        rows = admin_client.get("/api/admin/users", params={"q": query}).json()
        assert rows == [get_store().users[TARGET]]
    assert admin_client.get("/api/admin/users", params={"q": "%"}).json() == []
    for n in range(60):
        uid = f"00000000-0000-0000-0001-{n:012d}"
        get_store().users[uid] = {**get_store().users[TARGET], "id": uid}
    result = admin_client.get("/api/admin/users")
    assert result.status_code == 200
    assert len(result.json()) == 50
    assert set(result.json()[0]) == {"id", "email", "display_name", "role", "created_at"}
