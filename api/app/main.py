import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import errors
from .config import get_settings
from .db import get_store, init_store
from .routes import admin, content, review, tutor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_store()
    yield


app = FastAPI(title="Yaqin API", version="0.1.0", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().origins,
    allow_methods=["GET", "POST"],
    allow_headers=["authorization", "content-type"],
)
errors.install(app)


@app.get("/api/health")
async def health():
    s = get_settings()
    store = get_store()
    return {"ok": True, "model": s.bedrock_model_id if s.aws_enabled else None, "db": await store.ping(), "store": store.kind}


for r in (content.router, tutor.router, review.router, admin.router):
    app.include_router(r, prefix="/api")
