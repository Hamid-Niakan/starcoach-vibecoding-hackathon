from __future__ import annotations

import httpx
import pytest

from ai_gateway.proxy.providers.openai_compatible import OpenAICompatible
from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.support import FakeLimiter, completion_payload


@pytest.mark.asyncio
async def test_destination_model_credential_and_headers_are_operator_owned(gateway_env: dict[str, str]) -> None:
    seen: list[httpx.Request] = []

    async def upstream(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        payload = __import__("orjson").loads(request.content)
        assert payload["model"] == "fixture-model"
        assert request.url == "http://127.0.0.1:8080/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer fixture-secret-not-for-production"
        assert request.headers["accept-encoding"] == "identity"
        assert "x-forwarded-for" not in request.headers
        assert request.headers["x-request-id"] != "caller-id"
        return httpx.Response(200, json=completion_payload(), request=request)

    config = load_config()
    provider = OpenAICompatible(config, httpx.MockTransport(upstream))
    app = create_app(config, provider=provider, limiter=FakeLimiter())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        response = await client.post(
            "/v1/chat/completions",
            headers={"authorization": "Bearer caller", "x-forwarded-for": "203.0.113.2", "x-request-id": "caller-id"},
            json={"model": "test-chat", "messages": [{"role": "user", "content": "hello"}]},
        )
    assert response.status_code == 200
    assert response.json()["model"] == "test-chat"
    assert len(seen) == 1
