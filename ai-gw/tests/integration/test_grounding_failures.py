from __future__ import annotations

import asyncio

import httpx
import pytest

from ai_gateway.grounding.index_client import IndexClient, IndexUnavailable
from ai_gateway.grounding.orchestrator import GroundingOrchestrator
from ai_gateway.proxy._types import ProxyChatCompletionRequest
from ai_gateway.proxy.providers.openai_compatible import OpenAICompatible
from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.contract.test_grounded_chat_contract import REVISION, FakeIndex, enable_grounding
from tests.support import ChunkStream, FakeLimiter


class FailingIndex:
    async def search(self, query: str, *, service_filter: str | None = None):  # type: ignore[no-untyped-def]
        raise IndexUnavailable("documentation index unavailable")


@pytest.mark.asyncio
async def test_index_loss_returns_sanitized_retryable_failure_before_upstream(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    enable_grounding(monkeypatch)
    upstream_called = False

    async def upstream(request: httpx.Request) -> httpx.Response:
        nonlocal upstream_called
        upstream_called = True
        return httpx.Response(500, request=request)

    config = load_config()
    app = create_app(
        config,
        provider=OpenAICompatible(config, httpx.MockTransport(upstream)),
        limiter=FakeLimiter(),
        grounding_orchestrator=GroundingOrchestrator(config, FailingIndex()),
    )
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        response = await client.post(
            "/v1/chat/completions",
            json={"model": "test-chat", "messages": [{"role": "user", "content": "deploy"}]},
        )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "grounding_unavailable"
    assert "documentation index" not in response.text
    assert upstream_called is False


@pytest.mark.asyncio
async def test_timeout_and_malformed_index_responses_are_sanitized() -> None:
    for handler in (
        lambda request: (_ for _ in ()).throw(httpx.ReadTimeout("private", request=request)),
        lambda _: httpx.Response(200, json={"hits": "not-a-list"}),
    ):
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            client = IndexClient(
                http=http,
                base_url="https://meili.example",
                api_key="private-key",
                index_uid="liara_docs_active",
                revision=REVISION,
                timeout_seconds=0.01,
                candidate_limit=20,
            )
            with pytest.raises(IndexUnavailable, match="documentation index unavailable"):
                await client.search("deploy")


@pytest.mark.asyncio
async def test_retrieval_cancellation_propagates_without_admission(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    enable_grounding(monkeypatch)
    entered = asyncio.Event()
    blocker = asyncio.Event()

    class BlockingIndex:
        async def search(self, query: str, *, service_filter: str | None = None):  # type: ignore[no-untyped-def]
            entered.set()
            await blocker.wait()

    config = load_config()
    limiter = FakeLimiter()
    processor = create_app(
        config,
        limiter=limiter,
        grounding_orchestrator=GroundingOrchestrator(config, BlockingIndex()),
    ).state.request_processing
    payload = ProxyChatCompletionRequest(model="test-chat", messages=[{"role": "user", "content": "deploy"}])
    task = asyncio.create_task(processor.create_response(payload, "request-id", "client-id"))
    await entered.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert limiter.reservations == []
    assert limiter.reconciliations == []


@pytest.mark.asyncio
async def test_partial_grounded_paragraph_without_done_is_never_published_and_reconciles(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    enable_grounding(monkeypatch)
    limiter = FakeLimiter()

    async def upstream(request: httpx.Request) -> httpx.Response:
        chunks = (
            b'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,'
            b'"model":"fixture-model","choices":[{"index":0,"delta":{"content":"partial [[S"},'
            b'"finish_reason":null}]}\n\n',
        )
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            stream=ChunkStream(chunks),
            request=request,
        )

    config = load_config()
    processor = create_app(
        config,
        provider=OpenAICompatible(config, httpx.MockTransport(upstream)),
        limiter=limiter,
        grounding_orchestrator=GroundingOrchestrator(config, FakeIndex()),
    ).state.request_processing
    payload = ProxyChatCompletionRequest(
        model="test-chat",
        messages=[{"role": "user", "content": "deploy"}],
        stream=True,
    )
    response, reservation = await processor.create_response(payload, "request-id", "client-id")
    chunks = [chunk async for chunk in processor.stream_response(response, reservation)]
    assert chunks == []
    assert limiter.reconciliations == [None]


@pytest.mark.asyncio
async def test_readiness_requires_redis_and_approved_index_but_not_generation_upstream(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    enable_grounding(monkeypatch)
    config = load_config()
    index_ready = False
    upstream_called = False

    async def readiness() -> bool:
        return index_ready

    async def upstream(request: httpx.Request) -> httpx.Response:
        nonlocal upstream_called
        upstream_called = True
        return httpx.Response(500, request=request)

    app = create_app(
        config,
        provider=OpenAICompatible(config, httpx.MockTransport(upstream)),
        limiter=FakeLimiter(),
        grounding_orchestrator=GroundingOrchestrator(config, FakeIndex()),
        grounding_readiness_check=readiness,
    )
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        unavailable = await client.get("/health/readiness")
        index_ready = True
        available = await client.get("/health/readiness")
    assert unavailable.status_code == 503
    assert available.status_code == 200
    assert upstream_called is False
