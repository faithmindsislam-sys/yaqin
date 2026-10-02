import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

SUPABASE = "https://example-project.supabase.co"


@pytest.fixture
def es256(monkeypatch):
    from app import auth
    from app.config import get_settings

    monkeypatch.setenv("SUPABASE_URL", SUPABASE)
    get_settings.cache_clear()
    key = ec.generate_private_key(ec.SECP256R1())
    fake = SimpleNamespace(get_signing_key_from_jwt=lambda _token: SimpleNamespace(key=key.public_key()))
    monkeypatch.setattr(auth, "_jwks", lambda: fake)

    def token(**overrides):
        claims = {"sub": "00000000-0000-0000-0000-000000000001", "aud": "authenticated",
                  "iss": f"{SUPABASE}/auth/v1", "exp": int(time.time()) + 600, "email": "a@b.c"}
        return jwt.encode({**claims, **overrides}, key, algorithm="ES256", headers={"kid": "k1"})

    return token


def test_valid_es256_token_resolves_role(client, es256, monkeypatch):
    from app.db import get_store

    store = get_store()
    monkeypatch.setitem(store.roles, "00000000-0000-0000-0000-000000000001", "reviewer")
    r = client.get("/api/review/queue", headers={"Authorization": f"Bearer {es256()}"})
    assert r.status_code == 200


def test_learner_cannot_review(client, es256):
    r = client.get("/api/review/queue", headers={"Authorization": f"Bearer {es256()}"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "forbidden"


@pytest.mark.parametrize("bad", [{"aud": "anon"}, {"iss": "https://evil.example/auth/v1"}, {"exp": int(time.time()) - 10}, {"sub": "invalid-uuid"}])
def test_wrong_audience_issuer_or_expired_rejected(client, es256, bad):
    r = client.get("/api/review/queue", headers={"Authorization": f"Bearer {es256(**bad)}"})
    assert r.status_code == 401
