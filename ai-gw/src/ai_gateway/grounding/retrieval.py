from __future__ import annotations

import hashlib
import unicodedata
from dataclasses import dataclass

from ai_gateway.grounding.models import (
    CacheOutcome,
    ConfidenceBand,
    IntentKind,
    RetrievalDecision,
    SourcePassage,
)


@dataclass(frozen=True, slots=True)
class RetrievalCandidate:
    passage: SourcePassage
    lexical_rank: int | None
    semantic_rank: int | None
    score: float


@dataclass(frozen=True, slots=True)
class RetrievalSelection:
    passages: tuple[RetrievalCandidate, ...]
    decision: RetrievalDecision


def normalize_query(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    normalized = normalized.replace("ي", "ی").replace("ى", "ی").replace("ك", "ک")
    normalized = "".join(char for char in normalized if not 0x64B <= ord(char) <= 0x670)
    return " ".join(normalized.casefold().split())


def _hybrid_score(candidate: RetrievalCandidate) -> tuple[float, float, str]:
    fused = sum(
        1 / (60 + rank) for rank in (candidate.lexical_rank, candidate.semantic_rank) if rank is not None and rank > 0
    )
    return (fused, candidate.score, candidate.passage.id)


def select_passages(
    *,
    query: str,
    candidates: list[RetrievalCandidate],
    intent: IntentKind,
    token_limit: int,
    service_filter: str | None = None,
    conflicting_passage_ids: set[str] | None = None,
    revision: str | None = None,
    policy_version: str = "retrieval-v1",
) -> RetrievalSelection:
    normalized_query = normalize_query(query)
    passage_limit = 8 if intent is IntentKind.COMPLEX else 4
    eligible = [
        item
        for item in candidates
        if item.score >= 0.55 and (service_filter is None or service_filter in item.passage.service_tags)
    ]
    ranked = sorted(eligible, key=_hybrid_score, reverse=True)
    selected: list[RetrievalCandidate] = []
    hashes: set[str] = set()
    tokens = 0
    for item in ranked:
        if item.passage.content_hash in hashes:
            continue
        if tokens + item.passage.token_estimate > token_limit:
            continue
        selected.append(item)
        hashes.add(item.passage.content_hash)
        tokens += item.passage.token_estimate
        if len(selected) == passage_limit:
            break

    conflict_ids = conflicting_passage_ids or set()
    eligible_ids = {item.passage.id for item in eligible}
    if len(conflict_ids.intersection(eligible_ids)) >= 2:
        confidence = ConfidenceBand.CONFLICT
    elif not selected:
        confidence = ConfidenceBand.LOW
    elif selected[0].score >= 0.8:
        confidence = ConfidenceBand.HIGH
    else:
        confidence = ConfidenceBand.MEDIUM
    active_revision = revision or (selected[0].passage.revision if selected else "0" * 64)
    decision = RetrievalDecision(
        query_fingerprint=hashlib.sha256(normalized_query.encode()).hexdigest(),
        revision=active_revision,
        policy_version=policy_version,
        candidate_count=min(len(candidates), 100),
        selected_passage_ids=tuple(item.passage.id for item in selected),
        retrieval_tokens=tokens,
        confidence_band=confidence,
        cache_outcome=CacheOutcome.INELIGIBLE,
    )
    decision.assert_within_limits(passage_limit=passage_limit, token_limit=token_limit)
    return RetrievalSelection(passages=tuple(selected), decision=decision)
