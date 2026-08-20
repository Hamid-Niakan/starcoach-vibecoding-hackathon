from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from ai_gateway.proxy._types import ErrorObject, ErrorResponse
from ai_gateway.proxy.common_request_processing import ProxyBaseLLMRequestProcessing
from ai_gateway.proxy.endpoints.chat_completions import router as chat_router
from ai_gateway.proxy.endpoints.docs import mount_swagger_ui
from ai_gateway.proxy.endpoints.health import router as health_router
from ai_gateway.proxy.endpoints.metrics import router as metrics_router
from ai_gateway.proxy.endpoints.models import router as models_router
from ai_gateway.proxy.enforcement.parallel_request_limiter import ParallelRequestLimiter
from ai_gateway.proxy.enforcement.redis_store import RedisEnforcementStore
from ai_gateway.proxy.errors import ProxyException
from ai_gateway.proxy.middleware.in_flight_requests_middleware import InFlightRequestsMiddleware
from ai_gateway.proxy.middleware.request_context_middleware import RequestContextMiddleware
from ai_gateway.proxy.middleware.request_size_limit_middleware import RequestSizeLimitMiddleware
from ai_gateway.proxy.middleware.security_headers_middleware import SecurityHeadersMiddleware
from ai_gateway.proxy.observability.events import RequestOutcome
from ai_gateway.proxy.observability.log_queue import LoggingRuntime
from ai_gateway.proxy.observability.prometheus import PrometheusLogger
from ai_gateway.proxy.providers.openai_compatible import OpenAICompatible
from ai_gateway.proxy.proxy_config import ProxyConfig, load_config


@asynccontextmanager
async def _empty_lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield


def _error_response(
    status_code: int, message: str, error_type: str, code: str, param: str | None = None
) -> JSONResponse:
    body = ErrorResponse(error=ErrorObject(message=message, type=error_type, param=param, code=code))
    return JSONResponse(status_code=status_code, content=body.model_dump())


def create_app(
    config: ProxyConfig | None = None,
    *,
    lifespan: Any = None,
    provider: OpenAICompatible | None = None,
    limiter: ParallelRequestLimiter | None = None,
) -> FastAPI:
    settings = config or load_config()
    prometheus = PrometheusLogger()
    logging_runtime = LoggingRuntime(prometheus, settings.log_queue_capacity, settings.log_level)
    provider = provider or OpenAICompatible(settings)
    enforcement_store = None if limiter is not None else RedisEnforcementStore(settings)
    limiter = limiter or ParallelRequestLimiter(enforcement_store, prometheus)  # type: ignore[arg-type]

    @asynccontextmanager
    async def default_lifespan(_: FastAPI) -> AsyncIterator[None]:
        try:
            logging_runtime.start()
            logging_runtime.proxy_logging.emit(
                {
                    "event": "service.starting",
                    "severity": "info",
                    "deployment_id": settings.deployment_id,
                    "enforcement_epoch": settings.enforcement_epoch,
                    "config_schema_version": "v1",
                }
            )
            if enforcement_store is not None:
                await enforcement_store.start()
            prometheus.set_readiness(True)
            logging_runtime.proxy_logging.emit(
                {
                    "event": "service.ready",
                    "severity": "info",
                    "deployment_id": settings.deployment_id,
                    "enforcement_epoch": settings.enforcement_epoch,
                }
            )
            yield
        finally:
            prometheus.set_readiness(False)
            logging_runtime.proxy_logging.emit(
                {
                    "event": "service.stopping",
                    "severity": "info",
                    "in_progress_requests": 0,
                    "drain_deadline_seconds": 0.0,
                }
            )
            await provider.close()
            if enforcement_store is not None:
                await enforcement_store.close()
            logging_runtime.stop()

    app = FastAPI(
        title="AI Gateway",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan or default_lifespan,
        default_response_class=JSONResponse,
    )
    app.state.proxy_config = settings
    app.state.provider = provider
    app.state.enforcement_store = enforcement_store
    app.state.request_processing = ProxyBaseLLMRequestProcessing(settings, provider, limiter, prometheus)
    app.state.prometheus = prometheus
    app.state.proxy_logging = logging_runtime.proxy_logging
    app.state.logging_runtime = logging_runtime
    if enforcement_store is not None:
        app.state.readiness_check = enforcement_store.readiness_check
    else:

        async def injected_readiness() -> bool:
            return True

        app.state.readiness_check = injected_readiness

    @app.exception_handler(ProxyException)
    async def proxy_exception_handler(request: Request, exc: ProxyException) -> JSONResponse:
        if exc.code == "invalid_model":
            request.scope["ai_gateway.outcome"] = RequestOutcome.MODEL_REJECTED.value
            request.scope["ai_gateway.model_match"] = False
        elif exc.status_code == 429:
            request.scope["ai_gateway.outcome"] = (
                RequestOutcome.QUOTA_EXHAUSTED.value
                if exc.code.endswith("quota")
                else RequestOutcome.RATE_LIMITED.value
            )
            request.scope["ai_gateway.admission"] = exc.code
        elif exc.status_code == 503:
            request.scope["ai_gateway.outcome"] = RequestOutcome.STATE_UNAVAILABLE.value
        elif exc.status_code == 504:
            request.scope["ai_gateway.outcome"] = RequestOutcome.TIMEOUT.value
        elif exc.status_code == 502:
            request.scope["ai_gateway.outcome"] = (
                RequestOutcome.MALFORMED_UPSTREAM.value
                if "invalid" in exc.code or "stream" in exc.code
                else RequestOutcome.UPSTREAM_ERROR.value
            )
        return exc.as_response()

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, __: RequestValidationError) -> JSONResponse:
        request.scope["ai_gateway.outcome"] = RequestOutcome.INVALID_REQUEST.value
        return _error_response(400, "The request is invalid.", "invalid_request_error", "invalid_request")

    @app.exception_handler(404)
    async def not_found_handler(_: Request, __: Exception) -> JSONResponse:
        return _error_response(404, "The requested resource was not found.", "invalid_request_error", "not_found")

    @app.exception_handler(Exception)
    async def internal_exception_handler(request: Request, __: Exception) -> JSONResponse:
        request.scope["ai_gateway.outcome"] = RequestOutcome.INTERNAL_ERROR.value
        return _error_response(500, "The gateway could not complete the request.", "server_error", "internal_error")

    app.include_router(chat_router)
    app.include_router(models_router)
    app.include_router(health_router)
    app.include_router(metrics_router)
    mount_swagger_ui(app, settings.model_name)

    app.add_middleware(
        RequestSizeLimitMiddleware,
        max_body_bytes=settings.max_body_bytes,
        max_header_bytes=settings.max_header_bytes,
        max_header_count=settings.max_header_count,
        max_json_depth=settings.max_json_depth,
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        InFlightRequestsMiddleware, prometheus=prometheus, proxy_logging=logging_runtime.proxy_logging, config=settings
    )
    if settings.cors_allow_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_allow_origins),
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["content-type"],
            allow_credentials=False,
            max_age=600,
        )
    app.add_middleware(RequestContextMiddleware)
    return app
