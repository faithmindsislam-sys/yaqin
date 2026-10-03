"""Validated account administration requests."""

from typing import Literal

from pydantic import BaseModel


class RoleChange(BaseModel):
    role: Literal["learner", "teacher", "admin", "super_admin"]
