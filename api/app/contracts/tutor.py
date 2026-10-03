"""Validated HTTP requests for the tutor and explain-back endpoints."""

from typing import Literal

from pydantic import BaseModel, Field

Lang = Literal["en", "ar"]


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1500)
    lang: Lang = "en"
    lesson_id: str | None = None
    track: Literal["explore", "first-steps", "deepen"] | None = None
    history: list[Turn] = Field(default_factory=list, max_length=20)


class ExplainRequest(BaseModel):
    lesson_id: str
    transcript: str = Field(min_length=1, max_length=4000)
    lang: Lang = "en"
