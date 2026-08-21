from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from ai_gateway.grounding.cache import GroundingCache, MemoryCacheBackend, reviewed_answer_eligible
from ai_gateway.grounding.models import Citation, CitationValidation

REVISION = "a" * 64


def citation() -> Citation:
    return Citation(
        id="c1",
        marker=1,
        passage_id="passage-00000001",
        title="Docker",
        url="https://docs.liara.ir/paas/docker/",
        documentation_revision=REVISION,
        validation=CitationValidation.VALID,
    )


@pytest.mark.asyncio
async def test_exact_retrieval_key_is_hmac_scoped_and_contains_no_query() -> None:
    cache = GroundingCache(MemoryCacheBackend(), secret=b"s" * 32, ttl_seconds=3600, max_entries=2)
    key = cache.retrieval_key("  Docker   deploy ", revision=REVISION, policy_version="retrieval-v1")
    assert len(key) == 64
    assert "docker" not in key
    assert key == cache.retrieval_key("docker deploy", revision=REVISION, policy_version="retrieval-v1")


@pytest.mark.asyncio
async def test_retrieval_cache_is_revision_scoped_ttl_bounded_and_capacity_bounded() -> None:
    backend = MemoryCacheBackend()
    cache = GroundingCache(backend, secret=b"s" * 32, ttl_seconds=60, max_entries=1)
    now = datetime(2026, 8, 21, tzinfo=UTC)
    await cache.put_retrieval("one", ("passage-00000001",), revision=REVISION, policy_version="v1", now=now)
    assert await cache.get_retrieval("one", revision=REVISION, policy_version="v1", now=now) == ("passage-00000001",)
    assert await cache.get_retrieval("one", revision="b" * 64, policy_version="v1", now=now) is None
    assert (
        await cache.get_retrieval(
            "one",
            revision=REVISION,
            policy_version="v1",
            now=now + timedelta(seconds=61),
        )
        is None
    )
    await cache.put_retrieval("two", ("passage-00000002",), revision=REVISION, policy_version="v1", now=now)
    await cache.put_retrieval("three", ("passage-00000003",), revision=REVISION, policy_version="v1", now=now)
    assert len(backend.values) <= 1


@pytest.mark.parametrize(
    "text",
    [
        "api_key=sk-secret-value-123456789",
        "hamid@example.com",
        "09121234567",
        "merchant_id=1234567890",
        "conversation id 550e8400-e29b-41d4-a716-446655440000",
    ],
)
def test_reviewed_answer_rejects_secrets_pii_and_identifiers(text: str) -> None:
    assert not reviewed_answer_eligible(text, citations=(citation(),), reviewed=True)


def test_reviewed_answer_requires_review_and_valid_traceable_citations() -> None:
    answer = "برای استقرار از تنظیمات Docker استفاده کنید [۱]."
    assert reviewed_answer_eligible(answer, citations=(citation(),), reviewed=True)
    assert not reviewed_answer_eligible(answer, citations=(citation(),), reviewed=False)
    invalid = citation().model_copy(update={"validation": CitationValidation.INVALID})
    assert not reviewed_answer_eligible(answer, citations=(invalid,), reviewed=True)


@pytest.mark.asyncio
async def test_cache_failure_falls_back_to_miss() -> None:
    class BrokenBackend:
        async def get(self, key: str):
            raise RuntimeError("redis unavailable")

        async def set(self, key: str, value: bytes, ttl_seconds: int):
            raise RuntimeError("redis unavailable")

    cache = GroundingCache(BrokenBackend(), secret=b"s" * 32, ttl_seconds=3600, max_entries=2)
    assert await cache.get_retrieval("query", revision=REVISION, policy_version="v1") is None
    assert not await cache.put_retrieval("query", ("passage-00000001",), revision=REVISION, policy_version="v1")


@pytest.mark.asyncio
async def test_reviewed_exact_answer_has_one_hour_ttl_and_revision_invalidation() -> None:
    cache = GroundingCache(MemoryCacheBackend(), secret=b"s" * 32, ttl_seconds=3600, max_entries=2)
    now = datetime(2026, 8, 21, tzinfo=UTC)
    answer = "برای استقرار از تنظیمات Docker استفاده کنید [۱]."
    assert await cache.put_reviewed_answer(
        "faq-docker",
        answer,
        citations=(citation(),),
        reviewed=True,
        locale="fa",
        revision=REVISION,
        policy_version="answer-v1",
        now=now,
    )
    assert await cache.get_reviewed_answer(
        "faq-docker",
        locale="fa",
        revision=REVISION,
        policy_version="answer-v1",
        now=now,
    ) == (answer, ("passage-00000001",))
    assert (
        await cache.get_reviewed_answer(
            "faq-docker",
            locale="fa",
            revision="b" * 64,
            policy_version="answer-v1",
            now=now,
        )
        is None
    )
