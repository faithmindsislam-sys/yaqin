"""Validate staff-written content before it can reach the learner UI."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain.richtext import clean

# A site path, an https link, or a small raster image picked in the Studio editor.
# ponytail: picked images travel inline as data URLs (the browser shrinks them first);
# move them to object storage once lessons carry more than a cover image.
Image = Annotated[
    str,
    Field(max_length=700_000, pattern=r"^(/[\w./-]+|https://\S+|data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$"),
]


class Bi(BaseModel):
    """Text in English, Arabic, or both. Learner pages fall back to the language that exists."""

    en: str = Field(default="", max_length=12000)
    ar: str = Field(default="", max_length=12000)

    @model_validator(mode="after")
    def some_language(self):
        if not (self.en.strip() or self.ar.strip()):
            raise ValueError("Write this text in English, Arabic, or both.")
        return self


class Card(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    kind: Literal["concept", "quote", "practice", "check"]
    title: Bi
    body: Bi | None = None
    html: Bi | None = None  # formatted body from the Studio editor
    takeaway: Bi | None = None
    sources: list[str] = Field(min_length=1, max_length=30)
    label: Literal["obligatory", "recommended", "suggestion"] | None = None
    image: Image | None = None
    visual: str | None = None
    audio: dict[Literal["en", "ar"], str] | None = None

    @model_validator(mode="before")
    @classmethod
    def formatted_body(cls, data):
        # Clean the formatted text; search, narration and review checks read the plain `body` taken from it.
        if isinstance(data, dict) and isinstance(data.get("html"), dict):
            cleaned = {
                lang: clean(value)
                for lang, value in data["html"].items()
                if lang in ("en", "ar") and isinstance(value, str)
            }
            if any(text for _, text in cleaned.values()):
                return {
                    **data,
                    "html": {lang: html for lang, (html, _) in cleaned.items()},
                    "body": {lang: text for lang, (_, text) in cleaned.items()},
                }
            return {**data, "html": None}
        return data

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
    level: Literal[1, 2, 3, 4] = 1
    minutes: int = Field(gt=0, le=180)
    title: Bi
    summary: Bi
    cover: Image | None = None
    contributors: list[Annotated[str, Field(min_length=1, max_length=80)]] | None = Field(default=None, max_length=20)
    tags: list[Annotated[str, Field(min_length=1, max_length=40)]] | None = Field(default=None, max_length=12)
    status: Literal["draft", "in_review", "published", "archived"] = "draft"
    cards: list[Card] = Field(min_length=1, max_length=100)
    explain_back: Explain | None = None
    quiz: list[Quiz] | None = None

    @field_validator("level", mode="before")
    @classmethod
    def numbered_level(cls, value):
        # Accept existing drafts while all new content uses levels 1–4.
        return {"foundation": 1, "deeper": 2}.get(value, value) if isinstance(value, str) else value

    @model_validator(mode="after")
    def unique_ids(self):
        for items in (self.cards, self.quiz or [], self.explain_back.key_ideas if self.explain_back else []):
            ids = [i.id for i in items]
            if len(ids) != len(set(ids)):
                raise ValueError("Card, quiz and key idea ids must be unique within their lists.")
        return self
