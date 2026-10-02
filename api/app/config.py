from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]

# Profiles that belong to employer/work accounts and must never power this app.
DENIED_PROFILE_PREFIXES = ("aws-", "mbnsalem-12h")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(ROOT / "api" / ".env"), extra="ignore")

    env: str = "local"  # local | prod
    allowed_origins: str = "http://localhost:3000"

    aws_region: str = "us-west-2"
    # Deliberately not AWS_PROFILE: a shell-wide AWS_PROFILE must not leak into this app.
    yaqin_aws_profile: str | None = None
    bedrock_model_id: str = "anthropic.claude-opus-5-5"
    embed_model_id: str = "amazon.titan-embed-text-v2:0"

    database_url: str | None = None
    supabase_url: str | None = None
    supabase_jwt_secret: str | None = None  # legacy HS256 projects only

    content_dir: Path = ROOT / "content"
    dev_role: str | None = None  # local only: treat anonymous requests as this role

    tutor_rate_per_minute: int = 12
    retrieval_k: int = 8
    vector_floor: float = 0.32

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def aws_profile(self) -> str | None:
        p = self.yaqin_aws_profile
        if p and p.startswith(DENIED_PROFILE_PREFIXES):
            raise RuntimeError(f"AWS profile '{p}' is on the deny list for this app")
        return p

    @property
    def aws_enabled(self) -> bool:
        """AWS is used only with an explicit app profile or an attached task role."""
        in_container = any(
            os.environ.get(k) for k in ("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI")
        )
        return bool(self.aws_profile) or in_container


@lru_cache
def get_settings() -> Settings:
    return Settings()
