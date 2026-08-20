from __future__ import annotations

import httpx
import pytest

from ai_gateway.proxy.providers.openai_compatible import OpenAICompatible
from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.fixtures.sse_payloads import SPLIT_CHUNKS
from tests.support import ChunkStream, FakeLimiter


@pytest.mark.asyncio
async def test_split_sse_is_reframed_rewritten_and_finalized_once(gateway_env: dict[str, str]) -> None:
    limiter = FakeLimiter()

    async def upstream(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, headers={"content-type": "text/event-stream"}, stream=ChunkStream(SPLIT_CHUNKS), request=request
        )

    config = load_config()
    app = create_app(config, provider=OpenAICompatible(config, httpx.MockTransport(upstream)), limiter=limiter)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        response = await client.post(
            "/v1/chat/completions",
            json={"model": "test-chat", "messages": [{"role": "user", "content": "hi"}], "stream": True},
        )
    assert response.status_code == 200
    assert response.text.count("data: [DONE]") == 1
    assert "fixture-model" not in response.text
    assert '"model":"test-chat"' in response.text
    assert limiter.reconciliations == [3]
