from __future__ import annotations

import httpx
import pytest

from ai_gateway.proxy.providers.openai_compatible import OpenAICompatible
from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.fixtures.sse_payloads import VALID_CHUNKS
from tests.support import ChunkStream, FakeLimiter


@pytest.mark.asyncio
async def test_stream_finalizes_metrics_tokens_and_log_once(gateway_env: dict[str, str]) -> None:
    async def upstream(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, stream=ChunkStream(VALID_CHUNKS), request=request)

    config = load_config()
    app = create_app(config, provider=OpenAICompatible(config, httpx.MockTransport(upstream)), limiter=FakeLimiter())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        response = await client.post(
            "/v1/chat/completions",
            json={"model": "test-chat", "messages": [{"role": "user", "content": "canary prompt"}], "stream": True},
        )
    assert response.status_code == 200
    metrics = app.state.prometheus
    assert metrics.chat_requests_total.labels("success")._value.get() == 1
    assert metrics.chat_requests_in_progress._value.get() == 0
    assert metrics.input_tokens_total._value.get() == 2
    assert metrics.output_tokens_total._value.get() == 1
    record = app.state.logging_runtime.queue.get_nowait()
    assert record.msg["event"] == "request.completed"
    assert record.msg["request_id"] == response.headers["x-request-id"]
    assert "canary prompt" not in str(record.msg)
