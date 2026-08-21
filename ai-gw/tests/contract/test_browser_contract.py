from __future__ import annotations

import httpx
import pytest

from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.support import FakeLimiter


@pytest.mark.asyncio
async def test_allowed_browser_origin_can_send_optional_authorization_and_read_request_id(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_GATEWAY_CORS_ALLOW_ORIGINS", "https://docs.example.test")
    app = create_app(load_config(), limiter=FakeLimiter())

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        preflight = await client.options(
            "/v1/chat/completions",
            headers={
                "origin": "https://docs.example.test",
                "access-control-request-method": "POST",
                "access-control-request-headers": "authorization,content-type",
            },
        )
        response = await client.get(
            "/v1/models",
            headers={"origin": "https://docs.example.test", "authorization": "Bearer anonymous-placeholder"},
        )

    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == "https://docs.example.test"
    allowed_headers = preflight.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://docs.example.test"
    assert response.headers["access-control-expose-headers"].lower() == "x-request-id"
    assert response.headers["x-request-id"]


@pytest.mark.asyncio
async def test_disallowed_browser_origin_receives_no_cors_visibility(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_GATEWAY_CORS_ALLOW_ORIGINS", "https://docs.example.test")
    app = create_app(load_config(), limiter=FakeLimiter())

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        response = await client.get("/v1/models", headers={"origin": "https://attacker.example"})

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.asyncio
async def test_originless_openai_client_remains_available(gateway_env: dict[str, str]) -> None:
    app = create_app(load_config(), limiter=FakeLimiter())

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        response = await client.get("/v1/models", headers={"authorization": "Bearer sdk-placeholder"})

    assert response.status_code == 200
    assert response.json()["data"][0]["id"] == "test-chat"
    assert response.headers["x-request-id"]
