"""Titan embeddings, with keyword-search fallback when AWS is unavailable."""

from __future__ import annotations

import asyncio
import json
import logging
from threading import Lock

from app.configuration.settings import Settings
from app.gateways.embedding_gateway import EmbeddingGateway

log = logging.getLogger(__name__)
DIMENSIONS = 1024


class BedrockEmbeddingGateway(EmbeddingGateway):
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client = None
        self._client_lock = Lock()

    def _get_client(self):
        # Concurrent first requests must share one SDK client.
        with self._client_lock:
            if self._client is None:
                import boto3

                settings = self.settings
                session = (
                    boto3.Session(profile_name=settings.aws_profile, region_name=settings.aws_region)
                    if settings.aws_profile
                    else boto3.Session(region_name=settings.aws_region)
                )
                self._client = session.client("bedrock-runtime")
            return self._client

    def _embed_sync(self, text: str) -> list[float]:
        body = json.dumps({"inputText": text[:8000], "dimensions": DIMENSIONS, "normalize": True})
        response = self._get_client().invoke_model(
            modelId=self.settings.embed_model_id, body=body, accept="application/json", contentType="application/json"
        )
        return json.loads(response["body"].read())["embedding"]

    async def embed(self, text: str) -> list[float] | None:
        if not self.settings.aws_enabled:
            return None
        try:
            return await asyncio.to_thread(self._embed_sync, text)
        except Exception as error:  # Network, throttling, or missing model access.
            log.warning("embedding failed, falling back to keyword search: %s", error)
            return None

    async def close(self) -> None:
        client, self._client = self._client, None
        if client is not None:
            await asyncio.to_thread(client.close)
