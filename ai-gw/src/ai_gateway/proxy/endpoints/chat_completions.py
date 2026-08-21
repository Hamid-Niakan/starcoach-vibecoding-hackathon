from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from ai_gateway.proxy._types import ErrorResponse, ModelResponse, ProxyChatCompletionRequest
from ai_gateway.proxy.auth.anonymous_identity import derive_anonymous_client_id
from ai_gateway.proxy.auth.network import TrustedProxyConfig, resolve_client_ip
from ai_gateway.proxy.common_request_processing import ProxyBaseLLMRequestProcessing
from ai_gateway.proxy.constants import REQUEST_ID_SCOPE_KEY
from ai_gateway.proxy.errors import ProxyException

router = APIRouter(tags=["chat"])


@router.post(
    "/v1/chat/completions",
    operation_id="createChatCompletion",
    summary="Create a chat completion",
    description=(
        "The model must match the single listed public alias. The gateway requires no credential; clients that need "
        "OpenAI SDK parity may send a non-secret placeholder Bearer value, which is ignored and never forwarded. The "
        "gateway executes no tools. Set stream=true to receive raw server-sent events; Swagger may buffer them, so "
        "streaming clients should consume the response directly. Anonymous Redis-backed rate, token, concurrency, "
        "and quota limits apply."
    ),
    response_model=ModelResponse,
    responses={
        400: {"description": "Invalid request or model", "model": ErrorResponse},
        413: {"description": "Request body or bounded collection is too large", "model": ErrorResponse},
        415: {"description": "Unsupported media type or content encoding", "model": ErrorResponse},
        429: {"description": "Anonymous rate or quota limit exceeded", "model": ErrorResponse},
        500: {"description": "Sanitized internal failure", "model": ErrorResponse},
        502: {"description": "Sanitized upstream failure", "model": ErrorResponse},
        503: {"description": "Correct enforcement is unavailable", "model": ErrorResponse},
        504: {"description": "Configured upstream or request lifetime timed out", "model": ErrorResponse},
    },
)
async def chat_completion(payload: ProxyChatCompletionRequest, request: Request) -> Response:
    if payload.model != request.app.state.proxy_config.model_name:
        raise ProxyException.invalid_model()
    request.scope["ai_gateway.model_match"] = True
    request.scope["ai_gateway.model_name"] = request.app.state.proxy_config.model_name
    request.scope["ai_gateway.streaming"] = bool(payload.stream)
    processor: ProxyBaseLLMRequestProcessing = request.app.state.request_processing
    config = request.app.state.proxy_config
    if len(payload.messages) > config.max_messages:
        raise ProxyException.invalid_request("The request contains too many messages.", "messages")
    if len(payload.tools or []) > config.max_tools or len(payload.functions or []) > config.max_tools:
        raise ProxyException.invalid_request("The request contains too many tools.", "tools")
    client_ip, _ = resolve_client_ip(
        request,
        TrustedProxyConfig(
            trusted_proxy_cidrs=config.trusted_proxy_cidrs,
            max_forwarded_hops=config.max_forwarded_hops,
        ),
    )
    client_id = derive_anonymous_client_id(client_ip, config.identity_secret.get_secret_value())
    result, reservation = await processor.create_response(
        payload, request.scope[REQUEST_ID_SCOPE_KEY], client_id, request.scope
    )
    if payload.stream:
        return StreamingResponse(
            processor.stream_response(result, reservation, request.scope),  # type: ignore[arg-type]
            media_type="text/event-stream",
            headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache, no-store"},
        )
    return JSONResponse(result)
