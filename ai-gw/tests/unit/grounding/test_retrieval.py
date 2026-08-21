from __future__ import annotations

import httpx
import pytest

from ai_gateway.grounding.index_client import IndexClient, IndexUnavailable
from ai_gateway.grounding.models import (
    ApprovedDocumentationRevision,
    ConfidenceBand,
    IntentKind,
    RevisionStatus,
    SourcePassage,
)
from ai_gateway.grounding.retrieval import RetrievalCandidate, normalize_query, select_passages

REVISION = "a" * 64


def passage(
    passage_id: str,
    *,
    path: str,
    content_hash: str,
    tokens: int = 100,
    service: str = "paas",
    heading: str = "deploy",
) -> SourcePassage:
    return SourcePassage(
        id=passage_id * 16,
        revision=REVISION,
        source_path=path,
        canonical_url=f"https://docs.liara.ir/{service}/{path.removesuffix('.md')}/",
        verified_anchor=heading,
        title=path,
        heading_path=(heading,),
        service_tags=(service,),
        language="mixed",
        content=f"official evidence {passage_id}",
        normalized_content=f"official evidence {passage_id}",
        code_languages=(),
        token_estimate=tokens,
        content_hash=content_hash * 64,
    )


def candidate(
    key: str,
    *,
    lexical: int | None,
    semantic: int | None,
    score: float,
    **passage_options: object,
) -> RetrievalCandidate:
    return RetrievalCandidate(
        passage=passage(key, **passage_options),  # type: ignore[arg-type]
        lexical_rank=lexical,
        semantic_rank=semantic,
        score=score,
    )


def test_query_normalization_preserves_technical_tokens_and_maps_persian_variants() -> None:
    assert normalize_query("چطور يک Node.js app رو deploy کنم؟ LIARA_API_KEY") == (
        "چطور یک node.js app رو deploy کنم؟ liara_api_key"
    )
    assert normalize_query("chetor docker deploy konam?") == "chetor docker deploy konam?"


def test_hybrid_selection_filters_service_deduplicates_and_diversifies_pages() -> None:
    candidates = [
        candidate("a", lexical=1, semantic=3, score=0.93, path="one.md", content_hash="1"),
        candidate("b", lexical=3, semantic=1, score=0.91, path="two.md", content_hash="2"),
        candidate("c", lexical=2, semantic=2, score=0.92, path="one.md", content_hash="3"),
        candidate("d", lexical=4, semantic=4, score=0.90, path="db.md", content_hash="4", service="dbs"),
        candidate("e", lexical=5, semantic=5, score=0.89, path="duplicate.md", content_hash="1"),
    ]

    selected = select_passages(
        query="deploy paas",
        candidates=candidates,
        intent=IntentKind.DIRECT,
        token_limit=400,
        service_filter="paas",
    )
    assert [item.passage.id for item in selected.passages] == ["a" * 16, "b" * 16, "c" * 16]
    assert selected.decision.confidence_band is ConfidenceBand.HIGH
    assert selected.decision.retrieval_tokens == 300


def test_threshold_conflict_and_route_bounds_are_conservative() -> None:
    low = select_passages(
        query="unknown",
        candidates=[candidate("a", lexical=1, semantic=None, score=0.2, path="one.md", content_hash="1")],
        intent=IntentKind.DIRECT,
        token_limit=500,
    )
    assert low.passages == ()
    assert low.decision.confidence_band is ConfidenceBand.LOW

    conflicting = select_passages(
        query="version",
        candidates=[
            candidate("a", lexical=1, semantic=1, score=0.9, path="one.md", content_hash="1"),
            candidate("b", lexical=2, semantic=2, score=0.88, path="two.md", content_hash="2"),
        ],
        intent=IntentKind.COMPLEX,
        token_limit=150,
        conflicting_passage_ids={"a" * 16, "b" * 16},
    )
    assert len(conflicting.passages) == 1
    assert conflicting.decision.confidence_band is ConfidenceBand.CONFLICT
    conflicting.decision.assert_within_limits(passage_limit=8, token_limit=150)


@pytest.mark.asyncio
async def test_index_client_bounds_payload_and_sanitizes_failures() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/indexes/liara_docs_active/search"
        assert request.headers["authorization"] == "Bearer private-key"
        return httpx.Response(
            200,
            json={
                "hits": [
                    {
                        **passage("a", path="deploy.md", content_hash="1").model_dump(mode="json"),
                        "_rankingScore": 0.9,
                    }
                ],
                "estimatedTotalHits": 1,
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        client = IndexClient(
            http=http,
            base_url="https://meili.example",
            api_key="private-key",
            index_uid="liara_docs_active",
            revision=REVISION,
            timeout_seconds=1,
            candidate_limit=20,
        )
        result = await client.search("deploy", service_filter="paas")
    assert result.candidate_count == 1
    assert result.candidates[0].passage.id == "a" * 16

    async def failure(_: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="private upstream detail")

    async with httpx.AsyncClient(transport=httpx.MockTransport(failure)) as http:
        client = IndexClient(
            http=http,
            base_url="https://meili.example",
            api_key="private-key",
            index_uid="liara_docs_active",
            revision=REVISION,
            timeout_seconds=1,
            candidate_limit=20,
        )
        with pytest.raises(IndexUnavailable, match="documentation index unavailable") as raised:
            await client.search("deploy")
    assert "private" not in str(raised.value)


@pytest.mark.asyncio
async def test_index_client_validates_health_and_active_manifest_count() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            return httpx.Response(200, json={"status": "available"})
        if request.url.path.endswith("/search"):
            return httpx.Response(200, json={"hits": [{"id": "passage", "revision": REVISION}]})
        return httpx.Response(200, json={"numberOfDocuments": 42})

    manifest = ApprovedDocumentationRevision(
        revision=REVISION,
        upstream_revision="abcdef1",
        schema_version=1,
        chunker_version="section-v1",
        embedder_revision_digest="b" * 64,
        aggregate_checksum="c" * 64,
        page_count=10,
        chunk_count=42,
        built_at="2026-08-21T00:00:00Z",
        status=RevisionStatus.ACTIVE,
        index_uid=f"liara_docs_{REVISION[:16]}",
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        client = IndexClient(
            http=http,
            base_url="https://meili.example",
            api_key="private-key",
            index_uid="liara_docs_active",
            revision=REVISION,
            timeout_seconds=1,
            candidate_limit=20,
        )
        assert await client.health() is True
        await client.validate_manifest(manifest)
        assert await client.readiness_check() is True
