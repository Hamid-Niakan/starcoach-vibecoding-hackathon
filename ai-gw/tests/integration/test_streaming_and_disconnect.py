from __future__ import annotations

import asyncio

import httpx
import pytest

from ai_gateway.proxy._types import ProxyChatCompletionRequest
from ai_gateway.proxy.providers.openai_compatible import OpenAICompatible
from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.fixtures.sse_payloads import MALFORMED_AFTER_VALID_CHUNKS, MISSING_DONE_CHUNKS, SPLIT_CHUNKS
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


@pytest.mark.asyncio
@pytest.mark.parametrize("chunks", [MISSING_DONE_CHUNKS, MALFORMED_AFTER_VALID_CHUNKS])
async def test_incomplete_or_malformed_upstream_stream_never_gets_public_done(
    gateway_env: dict[str, str], chunks: tuple[bytes, ...]
) -> None:
    limiter = FakeLimiter()

    async def upstream(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, headers={"content-type": "text/event-stream"}, stream=ChunkStream(chunks), request=request
        )

    config = load_config()
    app = create_app(config, provider=OpenAICompatible(config, httpx.MockTransport(upstream)), limiter=limiter)
    processor = app.state.request_processing
    payload = ProxyChatCompletionRequest(
        model="test-chat", messages=[{"role": "user", "content": "hi"}], stream=True
    )
    response, reservation = await processor.create_response(payload, "request-id", "client-id")
    public_chunks = [chunk async for chunk in processor.stream_response(response, reservation)]

    assert public_chunks
    assert not any(b"[DONE]" in chunk for chunk in public_chunks)
    assert limiter.reconciliations == [None]


@pytest.mark.asyncio
async def test_first_upstream_done_is_normalized_and_closes_extra_events(gateway_env: dict[str, str]) -> None:
    limiter = FakeLimiter()
    chunks = (*SPLIT_CHUNKS, b"data: [DONE]\n\n", SPLIT_CHUNKS[0])

    async def upstream(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, headers={"content-type": "text/event-stream"}, stream=ChunkStream(chunks), request=request
        )

    config = load_config()
    app = create_app(config, provider=OpenAICompatible(config, httpx.MockTransport(upstream)), limiter=limiter)
    processor = app.state.request_processing
    payload = ProxyChatCompletionRequest(
        model="test-chat", messages=[{"role": "user", "content": "hi"}], stream=True
    )
    response, reservation = await processor.create_response(payload, "request-id", "client-id")
    public_chunks = [chunk async for chunk in processor.stream_response(response, reservation)]

    assert b"".join(public_chunks).count(b"data: [DONE]") == 1
    assert limiter.reconciliations == [3]


class BlockingStream(httpx.AsyncByteStream):
    def __init__(self) -> None:
        self.closed = False
        self.block = asyncio.Event()

    async def __aiter__(self):  # type: ignore[no-untyped-def]
        yield SPLIT_CHUNKS[0] + SPLIT_CHUNKS[1]
        await self.block.wait()

    async def aclose(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_consumer_cancellation_closes_upstream_and_reconciles_once(gateway_env: dict[str, str]) -> None:
    limiter = FakeLimiter()
    stream = BlockingStream()

    async def upstream(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, headers={"content-type": "text/event-stream"}, stream=stream, request=request
        )

    config = load_config()
    app = create_app(config, provider=OpenAICompatible(config, httpx.MockTransport(upstream)), limiter=limiter)
    processor = app.state.request_processing
    payload = ProxyChatCompletionRequest(
        model="test-chat", messages=[{"role": "user", "content": "hi"}], stream=True
    )
    response, reservation = await processor.create_response(payload, "request-id", "client-id")
    public_stream = processor.stream_response(response, reservation)
    first = await anext(public_stream)
    pending = asyncio.create_task(anext(public_stream))
    await asyncio.sleep(0)
    pending.cancel()

    with pytest.raises(asyncio.CancelledError):
        await pending
    assert b'"content":"hi"' in first
    assert stream.closed
    assert limiter.reconciliations == [None]
