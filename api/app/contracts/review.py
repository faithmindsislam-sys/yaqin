"""Validated scholarly-review and curriculum requests."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Decision(BaseModel):
    decision: Literal["approve", "request_changes"]
    note: str = Field(default="", max_length=4000)


class AyahRef(BaseModel):
    surah: int = Field(ge=1, le=114)
    ayah: int = Field(ge=1, le=286)


class PlannedTitle(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    en: str = Field(min_length=1, max_length=200)
    ar: str = Field(min_length=1, max_length=200)


class PlannedLocation(BaseModel):
    track: Literal["explore", "first-steps", "deepen"]
    module: str = Field(min_length=1, max_length=100)


class PlannedAdd(PlannedLocation):
    title: PlannedTitle


class PlannedRemove(PlannedLocation):
    index: int = Field(ge=0)
