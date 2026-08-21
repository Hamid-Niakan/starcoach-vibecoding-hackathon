from __future__ import annotations

import asyncio

import httpx
import pytest

from ai_gateway.grounding.cache import GroundingCache
from ai_gateway.grounding.orchestrator import GroundingOrchestrator
from ai_gateway.proxy._types import ProxyChatCompletionRequest
from ai_gateway.proxy.enforcement._types import AdmissionDecision, AdmissionReason
from ai_gateway.proxy.enforcement.parallel_request_limiter import ParallelRequestLimiter
from ai_gateway.proxy.errors import ProxyException
from ai_gateway.proxy.providers.openai_compatible import OpenAICompatible
from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.contract.test_grounded_chat_contract import FakeIndex, enable_grounding
from tests.support import FakeLimiter


class UnavailableEnforcementStore:
    async def admit(self, client_id: str, reserved_tokens: int, reserved_cost_micro_units: int):
        return (
            AdmissionDecision(False, AdmissionReason.STATE_UNAVAILABLE, retry_after=1),
            None,
        )


@pytest.mark.asyncio
async def test_enforcement_loss_fails_closed_before_public_work() -> None:
    limiter = ParallelRequestLimiter(UnavailableEnforcementStore())  # type: ignore[arg-type]
    with pytest.raises(ProxyException) as raised:
        await limiter.reserve("anonymous", 100, 10)
    assert raised.value.status_code == 503
    assert raised.value.code == "state_unavailable"


@pytest.mark.asyncio
async def test_cache_loss_is_a_bounded_miss_without_weakening_enforcement() -> None:
    class BrokenCache:
        async def get(self, key: str) -> bytes | None:
            raise ConnectionError("private redis failure")

        async def set(self, key: str, value: bytes, ttl_seconds: int) -> None:
            raise ConnectionError("private redis failure")

    cache = GroundingCache(
        BrokenCache(),  # type: ignore[arg-type]
        secret=b"c" * 32,
        ttl_seconds=60,
        max_entries=10,
    )
    assert (
        await cache.get_retrieval(
            "deploy",
            revision="a" * 64,
            policy_version="retrieval-v1",
        )
        is None
    )


@pytest.mark.asyncio
async def test_upstream_loss_reconciles_exactly_once_and_returns_sanitized_error(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    enable_grounding(monkeypatch)
    limiter = FakeLimiter()

    async def unavailable(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="provider-secret-detail", request=request)

    config = load_config()
    processor = create_app(
        config,
        provider=OpenAICompatible(config, httpx.MockTransport(unavailable)),
        limiter=limiter,
        grounding_orchestrator=GroundingOrchestrator(config, FakeIndex()),
    ).state.request_processing
    request = ProxyChatCompletionRequest(
        model="test-chat",
        messages=[{"role": "user", "content": "deploy"}],
    )
    with pytest.raises(ProxyException) as raised:
        await processor.create_response(request, "request-id", "anonymous")
    assert raised.value.code == "upstream_error"
    assert "provider-secret" not in raised.value.message
    assert limiter.reconciliations == [None]


@pytest.mark.asyncio
async def test_index_readiness_is_required_but_generation_upstream_is_not(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    enable_grounding(monkeypatch)
    ready = False
    upstream_calls = 0

    async def index_readiness() -> bool:
        return ready

    async def upstream(request: httpx.Request) -> httpx.Response:
        nonlocal upstream_calls
        upstream_calls += 1
        return httpx.Response(503, request=request)

    config = load_config()
    app = create_app(
        config,
        provider=OpenAICompatible(config, httpx.MockTransport(upstream)),
        limiter=FakeLimiter(),
        grounding_orchestrator=GroundingOrchestrator(config, FakeIndex()),
        grounding_readiness_check=index_readiness,
    )
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        assert (await client.get("/health/readiness")).status_code == 503
        ready = True
        assert (await client.get("/health/readiness")).status_code == 200
    assert upstream_calls == 0


@pytest.mark.asyncio
async def test_retrieval_cancellation_propagates_without_leaking_a_reservation(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    enable_grounding(monkeypatch)
    entered = asyncio.Event()

    class BlockingIndex:
        async def search(self, query: str, *, service_filter: str | None = None) -> None:
            entered.set()
            await asyncio.Event().wait()

    limiter = FakeLimiter()
    config = load_config()
    processor = create_app(
        config,
        limiter=limiter,
        grounding_orchestrator=GroundingOrchestrator(
            config,
            BlockingIndex(),  # type: ignore[arg-type]
        ),
    ).state.request_processing
    request = ProxyChatCompletionRequest(model="test-chat", messages=[{"role": "user", "content": "deploy"}])
    task = asyncio.create_task(processor.create_response(request, "request-id", "anonymous"))
    await entered.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert limiter.reservations == []
    assert limiter.reconciliations == []


@pytest.mark.asyncio
async def test_total_deadline_failure_reconciles_once(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    enable_grounding(monkeypatch)

    class TimeoutProvider:
        async def send(self, *args: object, **kwargs: object) -> None:
            raise TimeoutError

    limiter = FakeLimiter()
    config = load_config()
    processor = create_app(
        config,
        provider=TimeoutProvider(),  # type: ignore[arg-type]
        limiter=limiter,
        grounding_orchestrator=GroundingOrchestrator(config, FakeIndex()),
    ).state.request_processing
    request = ProxyChatCompletionRequest(model="test-chat", messages=[{"role": "user", "content": "deploy"}])
    with pytest.raises(ProxyException) as raised:
        await processor.create_response(request, "request-id", "anonymous")
    assert raised.value.code == "request_timeout"
    assert limiter.reconciliations == [None]
