from __future__ import annotations

import asyncio
import secrets

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.types import ASGIApp, Message, Receive, Scope, Send

router = APIRouter()
_scrape_limit = asyncio.Semaphore(4)


@router.get("/metrics", include_in_schema=False)
async def metrics(request: Request) -> Response:
    config = request.app.state.proxy_config
    if not config.allow_unauthenticated_metrics:
        expected = config.metrics_token.get_secret_value() if config.metrics_token is not None else ""
        supplied = request.headers.get("authorization", "")
        candidate = supplied[7:] if supplied.startswith("Bearer ") else ""
        if not expected or not secrets.compare_digest(candidate.encode(), expected.encode()):
            return JSONResponse(
                {"error": "metrics authentication required"},
                status_code=401,
                headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
            )
    async with _scrape_limit:
        body = generate_latest(request.app.state.prometheus.registry)
    return Response(
        body,
        headers={
            "Content-Type": CONTENT_TYPE_LATEST,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


class MetricsNoCorsMiddleware:
    """Metrics are an operator surface and must never become browser-readable."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path") != "/metrics":
            await self.app(scope, receive, send)
            return

        async def strip_cors(message: Message) -> None:
            if message["type"] == "http.response.start":
                message["headers"] = [
                    (name, value)
                    for name, value in message.get("headers", [])
                    if not name.lower().startswith(b"access-control-")
                ]
            await send(message)

        await self.app(scope, receive, strip_cors)
