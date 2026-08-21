from __future__ import annotations

import httpx
import pytest
from openai import AsyncOpenAI

from ai_gateway.proxy.providers.openai_compatible import OpenAICompatible
from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.support import FakeLimiter, completion_payload


@pytest.mark.asyncio
async def test_openai_sdk_models_and_chat(gateway_env: dict[str, str]) -> None:
    async def upstream(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=completion_payload(), request=request)

    config = load_config()
    provider = OpenAICompatible(config, httpx.MockTransport(upstream))
    app = create_app(config, provider=provider, limiter=FakeLimiter())
    gateway_client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway/v1")
    sdk = AsyncOpenAI(api_key="unused-by-anonymous-gateway", base_url="http://gateway/v1", http_client=gateway_client)
    # Avoid the SDK's unrelated platform-probe thread in constrained CI sandboxes.
    sdk._platform = "Linux"
    try:
        models = await sdk.models.list()
        assert [item.id for item in models.data] == ["test-chat"]
        completion = await sdk.chat.completions.create(
            model="test-chat", messages=[{"role": "user", "content": "hello"}]
        )
        assert completion.model == "test-chat"
        assert completion.usage and completion.usage.total_tokens == 4
    finally:
        await sdk.close()
