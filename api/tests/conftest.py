from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.gateways.llm_gateway import LLMGateway, LLMUnavailable

FIXTURES = Path(__file__).parent / "fixtures" / "content"


@pytest.fixture(autouse=True)
def _settings(monkeypatch):
    monkeypatch.setenv("CONTENT_DIR", str(FIXTURES))
    monkeypatch.setenv("TUTOR_RATE_PER_MINUTE", "1000")
    # Override the private .env; tests must never connect to live infrastructure.
    monkeypatch.setenv("ENV", "local")
    for k in ("DATABASE_URL", "YAQIN_AWS_PROFILE", "SUPABASE_URL", "SUPABASE_JWT_SECRET", "DEV_ROLE"):
        monkeypatch.setenv(k, "")
    for k in ("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI"):
        monkeypatch.delenv(k, raising=False)
    from app.configuration.settings import get_settings

    get_settings.cache_clear()
    from app.http import rate_limit as ratelimit

    ratelimit._buckets.clear()
    yield
    get_settings.cache_clear()


class FakeLLM(LLMGateway):
    """Returns queued structured outputs in order and records the calls."""

    def __init__(self, *outputs):
        self.outputs = list(outputs)
        self.calls = []

    async def structured(self, **kwargs):
        self.calls.append(kwargs)
        if not self.outputs:
            raise LLMUnavailable("no more fake outputs")
        out = self.outputs.pop(0)
        if isinstance(out, Exception):
            raise out
        return out

    async def close(self):
        pass


@pytest.fixture
def fake_llm(monkeypatch):
    def install(*outputs):
        from app.main import app

        fake = FakeLLM(*outputs)
        monkeypatch.setattr(app.state.services.tutor, "llm", fake)
        monkeypatch.setattr(app.state.services.lessons.reviewer, "llm", fake)
        return fake

    return install


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c
