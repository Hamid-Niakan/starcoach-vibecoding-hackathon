from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["alive", "ready", "not_ready"]


@router.get(
    "/health/liveness",
    response_model=HealthResponse,
    operation_id="getLiveness",
    summary="Check whether the process is alive",
)
async def health_liveness() -> HealthResponse:
    return HealthResponse(status="alive")


@router.get(
    "/health/readiness",
    response_model=HealthResponse,
    operation_id="getReadiness",
    summary="Check whether correct admission decisions can be made",
    responses={503: {"description": "Gateway is not ready", "model": HealthResponse}},
)
async def health_readiness(request: Request) -> JSONResponse:
    checker = getattr(request.app.state, "readiness_check", None)
    ready = bool(await checker()) if checker is not None else False
    request.app.state.prometheus.set_readiness(ready)
    body = HealthResponse(status="ready" if ready else "not_ready")
    return JSONResponse(body.model_dump(), status_code=200 if ready else 503)
