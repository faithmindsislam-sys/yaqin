from fastapi import APIRouter, Depends

from .. import tutor
from ..db import get_store
from ..errors import ApiError
from ..ratelimit import limit

router = APIRouter(prefix="/tutor", dependencies=[Depends(limit)])


@router.post("/ask")
async def ask(req: tutor.AskRequest):
    return await tutor.ask(get_store(), req)


@router.post("/explain-back")
async def explain_back(req: tutor.ExplainRequest):
    result = await tutor.explain_back(get_store(), req)
    if result is None:
        raise ApiError(404, "not_found", f"No lesson '{req.lesson_id}'.")
    return result
