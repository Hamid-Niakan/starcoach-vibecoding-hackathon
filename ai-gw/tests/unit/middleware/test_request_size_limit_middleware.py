from __future__ import annotations

import httpx
import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from ai_gateway.proxy.middleware.request_size_limit_middleware import RequestSizeLimitMiddleware


@pytest.mark.asyncio
async def test_oversized_body_is_rejected_before_handler() -> None:
    called = False

    async def endpoint(request: Request) -> JSONResponse:
        nonlocal called
        called = True
        return JSONResponse({"size": len(await request.body())})

    app = RequestSizeLimitMiddleware(Starlette(routes=[Route("/", endpoint, methods=["POST"])]), max_body_bytes=4)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/", content=b"12345")
    assert response.status_code == 413
    assert not called


@pytest.mark.asyncio
async def test_unsupported_content_encoding_is_rejected() -> None:
    app = RequestSizeLimitMiddleware(Starlette(), max_body_bytes=100)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/", content=b"x", headers={"content-encoding": "gzip"})
    assert response.status_code == 415
