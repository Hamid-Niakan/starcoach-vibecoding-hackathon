from __future__ import annotations

import httpx
import pytest

from ai_gateway.proxy.providers.openai_compatible import OpenAICompatible
from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.security.test_destination_lock import test_destination_model_credential_and_headers_are_operator_owned
from tests.support import FakeLimiter, completion_payload

__all__ = ["test_destination_model_credential_and_headers_are_operator_owned"]


@pytest.mark.asyncio
async def test_untrusted_forwarding_headers_cannot_change_anonymous_identity(gateway_env: dict[str, str]) -> None:
    limiter = FakeLimiter()

    async def upstream(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=completion_payload(), request=request)

    config = load_config()
    app = create_app(config, provider=OpenAICompatible(config, httpx.MockTransport(upstream)), limiter=limiter)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        for spoofed in ("203.0.113.1", "203.0.113.2"):
            response = await client.post(
                "/v1/chat/completions",
                headers={"x-forwarded-for": spoofed},
                json={"model": "test-chat", "messages": [{"role": "user", "content": "hello"}]},
            )
            assert response.status_code == 200

    assert limiter.reservations[0][0] == limiter.reservations[1][0]
    assert "203.0.113" not in limiter.reservations[0][0]


@pytest.mark.asyncio
async def test_operator_trusted_peer_resolves_distinct_forwarded_identities(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_GATEWAY_TRUSTED_PROXY_CIDRS", "127.0.0.0/8")
    limiter = FakeLimiter()

    async def upstream(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=completion_payload(), request=request)

    config = load_config()
    app = create_app(config, provider=OpenAICompatible(config, httpx.MockTransport(upstream)), limiter=limiter)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        for forwarded in ("203.0.113.1", "203.0.113.2"):
            response = await client.post(
                "/v1/chat/completions",
                headers={"x-forwarded-for": forwarded},
                json={"model": "test-chat", "messages": [{"role": "user", "content": "hello"}]},
            )
            assert response.status_code == 200

    assert limiter.reservations[0][0] != limiter.reservations[1][0]
    assert all("203.0.113" not in client_id for client_id, _ in limiter.reservations)
