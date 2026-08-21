from __future__ import annotations

import httpx
import pytest

from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.support import FakeLimiter


@pytest.mark.asyncio
async def test_metrics_endpoint_is_sanitized_and_outside_openapi(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_GATEWAY_ALLOW_UNAUTHENTICATED_METRICS", "true")
    app = create_app(load_config(), limiter=FakeLimiter())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        response = await client.get("/metrics")
        schema = (await client.get("/openapi.json")).json()
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert "ai_gateway_ready" in response.text
    assert "python_" not in response.text and "process_" not in response.text
    assert "/metrics" not in schema["paths"]
