import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

SUPABASE = "https://example-project.supabase.co"


@pytest.fixture
def es256(monkeypatch, client):
    from app.configuration.settings import get_settings
    from app.gateways.supabase_token_gateway import SupabaseTokenGateway
    from app.main import app

    monkeypatch.setenv("SUPABASE_URL", SUPABASE)
    get_settings.cache_clear()
    key = ec.generate_private_key(ec.SECP256R1())
    fake = SimpleNamespace(get_signing_key_from_jwt=lambda _token: SimpleNamespace(key=key.public_key()))
    gateway = SupabaseTokenGateway(get_settings())
    monkeypatch.setattr(gateway, "_jwks_client", fake)
    monkeypatch.setattr(app.state.services, "tokens", gateway)

    def token(**overrides):
        claims = {
            "sub": "00000000-0000-0000-0000-000000000001",
            "aud": "authenticated",
            "iss": f"{SUPABASE}/auth/v1",
            "exp": int(time.time()) + 600,
            "email": "a@b.c",
        }
        return jwt.encode({**claims, **overrides}, key, algorithm="ES256", headers={"kid": "k1"})

    return token


@pytest.mark.parametrize("role", ["teacher", "admin", "super_admin", "instructor", "reviewer"])
def test_valid_es256_token_resolves_role(client, es256, monkeypatch, role):
    from app.main import app

    store = app.state.services.repository
    monkeypatch.setitem(store.roles, "00000000-0000-0000-0000-000000000001", role)
    r = client.get("/api/review/queue", headers={"Authorization": f"Bearer {es256()}"})
    assert r.status_code == 200


def test_learner_cannot_review(client, es256):
    r = client.get("/api/review/queue", headers={"Authorization": f"Bearer {es256()}"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "forbidden"


@pytest.mark.parametrize(
    "role,status", [("learner", 403), ("teacher", 403), ("admin", 200), ("super_admin", 200), ("unknown", 403)]
)
def test_only_admins_approve_sources(client, es256, monkeypatch, role, status):
    from app.main import app

    monkeypatch.setitem(app.state.services.repository.roles, "00000000-0000-0000-0000-000000000001", role)
    r = client.post("/api/review/sources/quran:5:6/approve", json={}, headers={"Authorization": f"Bearer {es256()}"})
    assert r.status_code == status


def test_signup_metadata_cannot_grant_staff_access(client, es256):
    token = es256(user_metadata={"role": "super_admin"}, app_metadata={"role": "super_admin"})
    r = client.get("/api/review/queue", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_role_demotion_takes_effect_without_replacing_the_token(client, es256, monkeypatch):
    from app.main import app

    roles = app.state.services.repository.roles
    user_id = "00000000-0000-0000-0000-000000000001"
    headers = {"Authorization": f"Bearer {es256()}"}
    monkeypatch.setitem(roles, user_id, "admin")
    assert client.get("/api/review/queue", headers=headers).status_code == 200
    monkeypatch.setitem(roles, user_id, "learner")
    assert client.get("/api/review/queue", headers=headers).status_code == 403


@pytest.mark.parametrize(
    "role,allowed",
    [("learner", False), ("teacher", False), ("admin", False), ("super_admin", True), ("unknown", False)],
)
def test_super_admin_guard_is_reserved_for_platform_management(role, allowed):
    import asyncio

    from app.domain.errors import ApiError
    from app.http.auth import User, require_role

    dependency = require_role("super_admin")
    user = User(id="00000000-0000-0000-0000-000000000001", role=role)
    if allowed:
        assert asyncio.run(dependency(user)) == user
    else:
        with pytest.raises(ApiError) as error:
            asyncio.run(dependency(user))
        assert error.value.status == 403


@pytest.mark.parametrize(
    "bad",
    [{"aud": "anon"}, {"iss": "https://evil.example/auth/v1"}, {"exp": int(time.time()) - 10}, {"sub": "invalid-uuid"}],
)
def test_wrong_audience_issuer_or_expired_rejected(client, es256, bad):
    r = client.get("/api/review/queue", headers={"Authorization": f"Bearer {es256(**bad)}"})
    assert r.status_code == 401
