from __future__ import annotations

import httpx
import pytest

from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.support import FakeLimiter


@pytest.mark.asyncio
async def test_swagger_is_public_local_and_redoc_is_disabled(gateway_env: dict[str, str]) -> None:
    app = create_app(load_config(), limiter=FakeLimiter())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        docs = await client.get("/docs")
        bundle = await client.get("/static/swagger/swagger-ui-bundle.js")
        redoc = await client.get("/redoc")
    assert docs.status_code == 200 and bundle.status_code == 200
    assert "cdn.jsdelivr" not in docs.text and "unpkg.com" not in docs.text
    assert "/static/swagger/swagger-ui-bundle.js" in docs.text
    assert redoc.status_code == 404
