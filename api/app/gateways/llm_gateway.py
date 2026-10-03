from abc import ABC, abstractmethod


class LLMUnavailable(Exception):
    """Model execution failed; callers can use their deterministic fallback."""


class LLMGateway(ABC):
    """Return a JSON object validated against the caller's schema."""

    @abstractmethod
    async def structured(
        self, *, system: str, messages: list[dict], schema: dict, effort: str = "medium", max_tokens: int = 4000
    ) -> dict: ...

    @abstractmethod
    async def close(self) -> None: ...
