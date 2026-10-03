from fastapi import APIRouter, Depends

from app.agents.tutor.agent import TutorAgent
from app.contracts.tutor import AskRequest, ExplainRequest
from app.dependencies import get_tutor_agent
from app.domain.errors import ApiError
from app.http.rate_limit import limit

router = APIRouter(prefix="/tutor", dependencies=[Depends(limit)])


@router.post("/ask")
async def ask(req: AskRequest, service: TutorAgent = Depends(get_tutor_agent)):
    return await service.ask(req)


@router.post("/explain-back")
async def explain_back(req: ExplainRequest, service: TutorAgent = Depends(get_tutor_agent)):
    result = await service.explain_back(req)
    if result is None:
        raise ApiError(404, "not_found", f"No lesson '{req.lesson_id}'.")
    return result
