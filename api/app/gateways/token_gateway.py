from abc import ABC, abstractmethod


class InvalidSessionToken(Exception):
    """The session token could not be verified."""


class TokenGateway(ABC):
    @abstractmethod
    async def decode_token(self, token: str) -> dict:
        """Verify signature and required claims; raise InvalidSessionToken on failure."""
        ...
