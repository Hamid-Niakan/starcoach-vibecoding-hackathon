from __future__ import annotations

from fastapi import APIRouter, Request

from ai_gateway.proxy._types import ModelInfoResponse, ModelListResponse

router = APIRouter(tags=["models"])


@router.get(
    "/v1/models",
    response_model=ModelListResponse,
    operation_id="listModels",
    summary="List the configured public model",
    description=(
        "Returns one immutable local compatibility entry. It never queries Redis or the upstream provider and never "
        "exposes the protected destination model or URL."
    ),
)
async def model_list(request: Request) -> ModelListResponse:
    return ModelListResponse(data=[ModelInfoResponse(id=request.app.state.proxy_config.model_name)])
