"""Validate staff-written content before it can reach the learner UI."""
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, model_validator


class Bi(BaseModel):
    en: str = Field(min_length=1, max_length=12000)
    ar: str = Field(min_length=1, max_length=12000)


class Card(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    kind: Literal["concept", "quote", "practice", "check"]
    title: Bi
    body: Bi | None = None
    takeaway: Bi | None = None
    sources: list[str] = Field(min_length=1, max_length=30)
    label: Literal["obligatory", "recommended", "suggestion"] | None = None
    image: str | None = None
    visual: str | None = None
    audio: dict[Literal["en", "ar"], str] | None = None

    @model_validator(mode="after")
    def body_matches_kind(self):
        if self.kind == "quote" and self.body is not None:
            raise ValueError("Quote cards render stored sources and cannot have a body.")
        if self.kind != "quote" and self.body is None:
            raise ValueError("Non-quote cards need a body.")
        return self


class Idea(Bi):
    id: str = Field(min_length=1, max_length=100)
    source: str | None = None


class Explain(BaseModel):
    prompt: Bi
    key_ideas: list[Idea] = Field(min_length=1, max_length=50)


class Quiz(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    question: Bi
    options: list[Bi] = Field(min_length=2, max_length=10)
    answer: int = Field(ge=0)
    explanation: Bi | None = None
    source: str | None = None

    @model_validator(mode="after")
    def answer_in_range(self):
        if self.answer >= len(self.options):
            raise ValueError("Quiz answer is outside the options.")
        return self


class LessonDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,99}$")
    track: Literal["explore", "first-steps", "deepen"]
    module: str = Field(min_length=1, max_length=100)
    level: Literal["foundation", "deeper"] = "foundation"
    minutes: int = Field(gt=0, le=180)
    title: Bi
    summary: Bi
    cover: str | None = None
    status: Literal["draft", "in_review", "published"] = "draft"
    cards: list[Card] = Field(min_length=1, max_length=100)
    explain_back: Explain | None = None
    quiz: list[Quiz] | None = None

    @model_validator(mode="after")
    def unique_ids(self):
        for items in (self.cards, self.quiz or [], self.explain_back.key_ideas if self.explain_back else []):
            ids = [i.id for i in items]
            if len(ids) != len(set(ids)):
                raise ValueError("Card, quiz and key idea ids must be unique within their lists.")
        return self
