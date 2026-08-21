from __future__ import annotations

import httpx
import pytest

from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.support import FakeLimiter


@pytest.mark.asyncio
async def test_production_metrics_require_dedicated_bearer_and_never_emit_cors_or_cache(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_GATEWAY_METRICS_TOKEN", "metrics-secret-value-with-enough-entropy")
    monkeypatch.setenv("AI_GATEWAY_CORS_ALLOW_ORIGINS", "https://docs.liara.ir")
    app = create_app(load_config(), limiter=FakeLimiter())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        denied = await client.get(
            "/metrics", headers={"origin": "https://docs.liara.ir", "authorization": "Bearer wrong"}
        )
        allowed = await client.get(
            "/metrics",
            headers={
                "origin": "https://docs.liara.ir",
                "authorization": "Bearer metrics-secret-value-with-enough-entropy",
            },
        )
        schema = (await client.get("/openapi.json")).json()
    assert denied.status_code == 401 and denied.json() == {"error": "metrics authentication required"}
    assert allowed.status_code == 200 and "ai_gateway_ready" in allowed.text
    for response in (denied, allowed):
        assert response.headers["cache-control"] == "no-store"
        assert "access-control-allow-origin" not in response.headers
    assert "/metrics" not in schema["paths"]


@pytest.mark.asyncio
async def test_explicit_local_metrics_exception_needs_no_token(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_GATEWAY_ALLOW_UNAUTHENTICATED_METRICS", "true")
    app = create_app(load_config(), limiter=FakeLimiter())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        assert (await client.get("/metrics")).status_code == 200


def test_metrics_configuration_fails_closed_without_token_or_explicit_exception(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    config = load_config()
    app = create_app(config, limiter=FakeLimiter())
    assert app.state.proxy_config.metrics_token is None
    assert app.state.proxy_config.allow_unauthenticated_metrics is False
