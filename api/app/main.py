import logging
from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.configuration.settings import get_settings
from app.container import create_repository, create_services
from app.controllers import admin_controller, content_controller, health_controller, review_controller, tutor_controller
from app.http import error_handlers

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(application: FastAPI):
    settings = get_settings()
    async with AsyncExitStack() as stack:
        repository = await create_repository(settings)
        stack.push_async_callback(repository.close)
        services = create_services(repository, settings)
        # Register storage cleanup before composition so startup failures cannot leak it.
        stack.push_async_callback(services.embeddings.close)
        stack.push_async_callback(services.llm.close)
        application.state.services = services
        yield


def create_app() -> FastAPI:
    application = FastAPI(
        title="Yaqin API", version="0.1.0", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json"
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().origins,
        allow_methods=["GET", "POST"],
        allow_headers=["authorization", "content-type"],
    )
    error_handlers.install(application)
    for controller in (health_controller, content_controller, tutor_controller, review_controller, admin_controller):
        application.include_router(controller.router, prefix="/api")
    return application


app = create_app()
