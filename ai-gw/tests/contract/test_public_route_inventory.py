from __future__ import annotations

import httpx
import pytest

from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.support import FakeLimiter


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/",
        "/ui",
        "/dashboard",
        "/redoc",
        "/v1/models/test-chat",
        "/v1/completions",
        "/key/info",
        "/spend/logs",
        "/admin",
    ],
)
async def test_removed_surfaces_are_safe_404s(gateway_env: dict[str, str], path: str) -> None:
    app = create_app(load_config(), limiter=FakeLimiter())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://gateway", follow_redirects=False
    ) as client:
        response = await client.get(path)
    assert response.status_code == 404
    assert response.headers.get("location") is None
    assert response.json()["error"]["code"] == "not_found"
