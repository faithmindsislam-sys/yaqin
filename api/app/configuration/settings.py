from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[2]
ROOT = API_DIR.parent

# Profiles for unrelated accounts that must never power this app.
DENIED_PROFILE_PREFIXES = ("aws-",)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=API_DIR / ".env", extra="ignore")

    env: Literal["local", "prod"] = "local"
    allowed_origins: str = "http://localhost:3000"

    aws_region: str = "eu-west-1"
    # Claude's Messages endpoint on Bedrock (Mantle) serves Opus 5.5 from us-east-1.
    bedrock_region: str = "us-east-1"
    # Deliberately not AWS_PROFILE: a shell-wide AWS_PROFILE must not leak into this app.
    yaqin_aws_profile: str | None = None
    bedrock_model_id: str = "anthropic.claude-opus-5-5"
    embed_model_id: str = "amazon.titan-embed-text-v2:0"

    database_url: str | None = Field(default=None, repr=False)
    supabase_url: str | None = None
    supabase_jwt_secret: str | None = Field(default=None, repr=False)  # legacy HS256 projects only

    content_dir: Path = ROOT / "content"
    dev_role: str | None = None  # local only: treat anonymous requests as this role

    tutor_rate_per_minute: int = Field(default=12, gt=0)
    retrieval_k: int = Field(default=8, gt=0)
    vector_floor: float = Field(default=0.32, ge=0, le=1)

    @field_validator(
        "database_url", "supabase_url", "supabase_jwt_secret", "yaqin_aws_profile", "dev_role", mode="before"
    )
    @classmethod
    def empty_is_unconfigured(cls, value):
        return None if isinstance(value, str) and not value.strip() else value

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
