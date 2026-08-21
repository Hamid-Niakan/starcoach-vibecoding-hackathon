from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from ai_gateway.grounding.models import (
    AnswerBudget,
    AnswerPath,
    ApprovedDocumentationRevision,
    CacheOutcome,
    Citation,
    CitationValidation,
    ConfidenceBand,
    IntentDecision,
    IntentKind,
    RetrievalDecision,
    ReusableArtifact,
    ReusableArtifactKind,
    RevisionStatus,
    SourcePassage,
    UsageRecord,
)

REVISION = "a" * 64
NOW = datetime(2026, 8, 21, tzinfo=UTC)


def test_approved_revision_requires_reconciled_positive_counts() -> None:
    revision = ApprovedDocumentationRevision(
        revision=REVISION,
        upstream_revision="dbb7430b",
        schema_version=1,
        chunker_version="heading-v1",
        embedder_revision_digest=REVISION,
        aggregate_checksum=REVISION,
        page_count=1143,
        chunk_count=2000,
        built_at=NOW,
        status=RevisionStatus.ACTIVE,
    )
    assert revision.status is RevisionStatus.ACTIVE
    with pytest.raises(ValidationError):
        revision.model_copy(update={"page_count": 0}).model_validate({**revision.model_dump(), "page_count": 0})


def test_source_passage_allows_only_approved_canonical_origin() -> None:
    passage = SourcePassage(
        id="passage-00000001",
        revision=REVISION,
        source_path="paas/docker/index.md",
        canonical_url="https://docs.liara.ir/paas/docker/",
        verified_anchor="install",
        title="Docker",
        heading_path=("Docker", "Install"),
        service_tags=("paas",),
        language="mixed",
        content="Use Docker.",
        normalized_content="use docker.",
        code_languages=("bash",),
        token_estimate=12,
        content_hash=REVISION,
    )
    assert passage.canonical_url.host == "docs.liara.ir"
    with pytest.raises(ValidationError):
        SourcePassage(**{**passage.model_dump(), "canonical_url": "https://evil.example/source"})


def test_citation_revision_and_selected_passage_are_validated() -> None:
    citation = Citation(
        id="c1",
        marker=1,
        passage_id="passage-00000001",
        title="Docker",
        url="https://docs.liara.ir/paas/docker/",
        heading="Install",
        documentation_revision=REVISION,
        validation=CitationValidation.VALID,
    )
    citation.assert_traceable(REVISION, ("passage-00000001",))
    with pytest.raises(ValueError, match="citation_revision_mismatch"):
        citation.assert_traceable("b" * 64, ("passage-00000001",))
    with pytest.raises(ValueError, match="citation_passage_not_selected"):
        citation.assert_traceable(REVISION, ("different-passage",))


def test_retrieval_decision_enforces_route_caps_and_unique_passages() -> None:
    decision = RetrievalDecision(
        query_fingerprint=REVISION,
        revision=REVISION,
        policy_version="retrieval-v1",
        candidate_count=20,
        selected_passage_ids=("passage-00000001", "passage-00000002"),
        retrieval_tokens=500,
        confidence_band=ConfidenceBand.HIGH,
        cache_outcome=CacheOutcome.MISS,
    )
    decision.assert_within_limits(passage_limit=4, token_limit=2500)
    with pytest.raises(ValueError, match="retrieval_passage_limit"):
        decision.assert_within_limits(passage_limit=1, token_limit=2500)
    with pytest.raises(ValidationError):
        RetrievalDecision(
            **{**decision.model_dump(), "selected_passage_ids": ("same-passage-0001", "same-passage-0001")}
        )


def test_answer_budget_covers_every_hidden_call_and_route() -> None:
    budget = AnswerBudget(
        route=IntentKind.COMPLEX,
        history_tokens=1000,
        retrieval_tokens=6000,
        planner_input_tokens=1000,
        planner_output_tokens=200,
        generation_input_tokens=7000,
        generation_output_tokens=1200,
        max_cost_micro_units=5000,
    )
    assert budget.reserved_tokens == 16_400
    with pytest.raises(ValidationError):
        AnswerBudget(**{**budget.model_dump(), "max_cost_micro_units": 0})


def test_reusable_artifact_never_contains_raw_query_or_conversation() -> None:
    artifact = ReusableArtifact(
        kind=ReusableArtifactKind.RETRIEVAL_RESULT,
        key=REVISION,
        revision=REVISION,
        policy_version="retrieval-v1",
        passage_ids=("passage-00000001",),
        answer=None,
        created_at=NOW,
        expires_at=datetime(2026, 8, 21, 1, tzinfo=UTC),
    )
    assert "query" not in artifact.model_dump()
    with pytest.raises(ValidationError):
        ReusableArtifact(**{**artifact.model_dump(), "expires_at": NOW})


def test_usage_record_is_content_free_and_uses_closed_enums() -> None:
    record = UsageRecord(
        request_id="00000000-0000-4000-8000-000000000001",
        timestamp=NOW,
        deployment_digest=REVISION,
        pipeline_digest=REVISION,
        corpus_revision_digest=REVISION,
        intent=IntentKind.DIRECT,
        answer_path=AnswerPath.GENERATED,
        cache_outcome=CacheOutcome.MISS,
        candidate_count=20,
        selected_count=4,
        retrieval_tokens=500,
        planning_input_tokens=0,
        planning_output_tokens=0,
        generation_input_tokens=1000,
        generation_output_tokens=300,
        charged_tokens=1300,
        ttft_ms=500,
        total_latency_ms=1200,
        estimated_cost_micro_units=20,
        outcome="success",
        failure_category=None,
    )
    dumped = record.model_dump()
    assert not ({"prompt", "messages", "answer", "passages", "client_ip"} & dumped.keys())


def test_intent_decision_uses_bounded_closed_missing_fields() -> None:
    decision = IntentDecision(
        kind=IntentKind.CLARIFY,
        missing_fields=("service",),
        topic_changed=False,
        reason_code="material_service_ambiguity",
        planner_used=False,
    )
    assert decision.kind is IntentKind.CLARIFY
    with pytest.raises(ValidationError):
        IntentDecision(**{**decision.model_dump(), "missing_fields": ("secret",)})
