import httpx
import pytest
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route

from ai_gateway.proxy.middleware.security_headers_middleware import SecurityHeadersMiddleware


@pytest.mark.asyncio
async def test_security_headers_apply_to_all_responses() -> None:
    async def endpoint(_) -> PlainTextResponse:
        return PlainTextResponse("ok")

    app = SecurityHeadersMiddleware(Starlette(routes=[Route("/", endpoint)]))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"
