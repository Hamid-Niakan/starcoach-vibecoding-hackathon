from __future__ import annotations

import uuid

import httpx
import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from ai_gateway.proxy.middleware.request_context_middleware import RequestContextMiddleware, get_request_id


@pytest.mark.asyncio
async def test_gateway_overwrites_inbound_request_id_and_cleans_context() -> None:
    async def endpoint(request: Request) -> JSONResponse:
        return JSONResponse({"request_id": get_request_id(), "scope_id": request.scope["ai_gateway.request_id"]})

    app = RequestContextMiddleware(Starlette(routes=[Route("/", endpoint)]))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/", headers={"x-request-id": "caller-controlled\r\nvalue"})
    request_id = response.headers["x-request-id"]
    assert uuid.UUID(request_id)
    assert request_id != "caller-controlled\r\nvalue"
    assert response.json() == {"request_id": request_id, "scope_id": request_id}
    assert get_request_id() is None


@pytest.mark.asyncio
async def test_request_id_is_added_to_exception_response() -> None:
    async def endpoint(_: Request) -> JSONResponse:
        raise RuntimeError("boom")

    app = RequestContextMiddleware(Starlette(routes=[Route("/", endpoint)]))
    with pytest.raises(RuntimeError):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app, raise_app_exceptions=True), base_url="http://test"
        ) as client:
            await client.get("/")
    assert get_request_id() is None
