from __future__ import annotations

import asyncio

import httpx
import pytest

from ai_gateway.proxy._types import ProxyChatCompletionRequest
from ai_gateway.proxy.providers.openai_compatible import OpenAICompatible
from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.support import FakeLimiter, completion_payload


@pytest.mark.asyncio
async def test_non_stream_absolute_deadline_returns_sanitized_504_and_reconciles_once(
    gateway_env: dict[str, str],
) -> None:
    limiter = FakeLimiter()

    async def slow_upstream(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(0.05)
        return httpx.Response(200, json=completion_payload(), request=request)

    config = load_config().model_copy(update={"max_request_seconds": 0.01})
    app = create_app(config, provider=OpenAICompatible(config, httpx.MockTransport(slow_upstream)), limiter=limiter)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        response = await client.post(
            "/v1/chat/completions",
            json={"model": "test-chat", "messages": [{"role": "user", "content": "slow"}]},
        )

    assert response.status_code == 504
    assert response.json() == {
        "error": {
            "message": "The gateway request timed out.",
            "type": "server_error",
            "param": None,
            "code": "request_timeout",
        }
    }
    assert limiter.reconciliations == [None]


class TrickleStream(httpx.AsyncByteStream):
    def __init__(self, chunks: tuple[bytes, ...], delay: float) -> None:
        self.chunks = chunks
        self.delay = delay
        self.closed = False

    async def __aiter__(self):  # type: ignore[no-untyped-def]
        for chunk in self.chunks:
            await asyncio.sleep(self.delay)
            yield chunk

    async def aclose(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_stream_deadline_is_absolute_despite_trickle_and_reconciles_once(
    gateway_env: dict[str, str],
) -> None:
    limiter = FakeLimiter()
    stream = TrickleStream(
        (
            b'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":0,'
            b'"model":"fixture-model","choices":[{"index":0,"delta":{"content":"a"}}]}\n\n',
            b'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":0,'
            b'"model":"fixture-model","choices":[{"index":0,"delta":{"content":"b"}}]}\n\n',
            b"data: [DONE]\n\n",
        ),
        0.03,
    )

    async def upstream(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=stream, request=request)

    config = load_config().model_copy(update={"max_stream_seconds": 0.05})
    app = create_app(config, provider=OpenAICompatible(config, httpx.MockTransport(upstream)), limiter=limiter)
    processor = app.state.request_processing
    payload = ProxyChatCompletionRequest(
        model="test-chat", messages=[{"role": "user", "content": "trickle"}], stream=True
    )
    response, reservation = await processor.create_response(payload, "request-id", "client-id")
    chunks = [chunk async for chunk in processor.stream_response(response, reservation)]

    assert any(b'"content":"a"' in chunk for chunk in chunks)
    assert not any(b"[DONE]" in chunk for chunk in chunks)
    assert stream.closed
    assert limiter.reconciliations == [None]
