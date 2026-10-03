"""Application composition: concrete providers are selected only here."""

from dataclasses import dataclass

from app.agents.review.agent import ReviewAgent
from app.agents.tutor.agent import TutorAgent
from app.configuration.settings import Settings
from app.gateways.bedrock.embedding_gateway import BedrockEmbeddingGateway
from app.gateways.bedrock.llm_gateway import BedrockLLMGateway
from app.gateways.embedding_gateway import EmbeddingGateway
from app.gateways.llm_gateway import LLMGateway
from app.gateways.quran_catalog_gateway import QuranCatalogGateway
from app.gateways.supabase_token_gateway import SupabaseTokenGateway
from app.gateways.token_gateway import TokenGateway
from app.repositories.memory_repository import MemoryRepository
from app.repositories.postgres_repository import PostgresRepository
from app.repositories.repository import Repository
from app.services.content_service import ContentService
from app.services.lesson_service import LessonService
from app.services.retrieval_service import RetrievalService
from app.services.user_service import UserService


@dataclass
class ApplicationServices:
    repository: Repository
    content: ContentService
    lessons: LessonService
    users: UserService
    tutor: TutorAgent
    tokens: TokenGateway
    llm: LLMGateway
    embeddings: EmbeddingGateway


async def create_repository(settings: Settings) -> Repository:
    if settings.env == "prod" and (not settings.database_url or not settings.supabase_url):
        raise RuntimeError(
            "Production requires DATABASE_URL and SUPABASE_URL; memory storage is for local development only."
        )
    if settings.database_url:
        return await PostgresRepository.connect(settings.database_url)
    return MemoryRepository(settings.content_dir)


def create_services(repository: Repository, settings: Settings) -> ApplicationServices:
    llm = BedrockLLMGateway(settings)
    embeddings = BedrockEmbeddingGateway(settings)
    retrieval = RetrievalService(repository, embeddings, k=settings.retrieval_k, vector_floor=settings.vector_floor)
    reviewer = ReviewAgent(repository, llm)
    return ApplicationServices(
        repository=repository,
        content=ContentService(repository),
        lessons=LessonService(repository, reviewer, QuranCatalogGateway(settings.content_dir)),
        users=UserService(repository),
        tutor=TutorAgent(repository, llm, retrieval),
        tokens=SupabaseTokenGateway(settings),
        llm=llm,
        embeddings=embeddings,
    )
