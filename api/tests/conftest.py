from pathlib import Path

import pytest
from fastapi.testclient import TestClient

FIXTURES = Path(__file__).parent / "fixtures" / "content"


@pytest.fixture(autouse=True)
def _settings(monkeypatch):
    monkeypatch.setenv("CONTENT_DIR", str(FIXTURES))
    monkeypatch.setenv("TUTOR_RATE_PER_MINUTE", "1000")
    for k in ("DATABASE_URL", "YAQIN_AWS_PROFILE", "SUPABASE_URL", "DEV_ROLE", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI"):
        monkeypatch.delenv(k, raising=False)
    # Local .env may contain a real database; tests must always use memory storage.
    monkeypatch.setenv("DATABASE_URL", "")
    from app.config import get_settings

    get_settings.cache_clear()
    from app import ratelimit

    ratelimit._buckets.clear()
    yield
    get_settings.cache_clear()


class FakeLLM:
    """Returns queued structured outputs in order and records the calls."""

    def __init__(self, *outputs):
        self.outputs = list(outputs)
        self.calls = []

    async def __call__(self, **kwargs):
        self.calls.append(kwargs)
        if not self.outputs:
            from app.llm import LLMUnavailable

            raise LLMUnavailable("no more fake outputs")
        out = self.outputs.pop(0)
        if isinstance(out, Exception):
            raise out
        return out


@pytest.fixture
def fake_llm(monkeypatch):
    def install(*outputs):
        fake = FakeLLM(*outputs)
        monkeypatch.setattr("app.llm.structured", fake)
        return fake

    return install


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c
