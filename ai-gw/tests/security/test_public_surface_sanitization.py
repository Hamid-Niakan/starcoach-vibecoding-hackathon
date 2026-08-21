from __future__ import annotations

import httpx
import pytest

from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.support import FakeLimiter


@pytest.mark.asyncio
async def test_docs_and_openapi_do_not_expose_destination(gateway_env: dict[str, str]) -> None:
    app = create_app(load_config(), limiter=FakeLimiter())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        text = (await client.get("/openapi.json")).text + (await client.get("/docs")).text
    for protected in (
        "fixture-secret-not-for-production",
        "fixture-model",
        "127.0.0.1:8080",
        "litellm_params",
        "redis://",
    ):
        assert protected not in text
