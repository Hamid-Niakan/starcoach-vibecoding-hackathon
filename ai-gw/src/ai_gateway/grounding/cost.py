from __future__ import annotations

import hashlib
from dataclasses import dataclass
from enum import StrEnum


def estimate_cost_micro_units(
    input_tokens: int,
    output_tokens: int,
    *,
    input_rate_micro_per_million: int,
    output_rate_micro_per_million: int,
) -> int:
    values = (
        input_tokens,
        output_tokens,
        input_rate_micro_per_million,
        output_rate_micro_per_million,
    )
    if min(values) < 0:
        raise ValueError("negative_cost_input")
    numerator = input_tokens * input_rate_micro_per_million + output_tokens * output_rate_micro_per_million
    return (numerator + 999_999) // 1_000_000


class AggregateBudgetDecision(StrEnum):
    ALLOWED = "allowed"
    WARNING = "warning"
    REJECTED = "rejected"


@dataclass(frozen=True, slots=True)
class AggregateBudget:
    limit_micro_units: int
    warning_percent: int = 80

    def __post_init__(self) -> None:
        if self.limit_micro_units <= 0 or not 1 <= self.warning_percent < 100:
            raise ValueError("invalid_aggregate_budget")

    def decide(self, *, current_micro_units: int, reservation_micro_units: int) -> AggregateBudgetDecision:
        if min(current_micro_units, reservation_micro_units) < 0:
            raise ValueError("negative_aggregate_cost")
        projected = current_micro_units + reservation_micro_units
        if projected > self.limit_micro_units:
            return AggregateBudgetDecision.REJECTED
        if projected * 100 >= self.limit_micro_units * self.warning_percent:
            return AggregateBudgetDecision.WARNING
        return AggregateBudgetDecision.ALLOWED


@dataclass(frozen=True, slots=True)
class CandidateResult:
    protected_name: str
    quality_score: int
    latency_p95_ms: int
    estimated_cost_micro_units: int


def select_least_cost_passing(
    candidates: list[CandidateResult],
    *,
    minimum_quality: int,
    maximum_latency_ms: int,
) -> CandidateResult:
    eligible = [
        candidate
        for candidate in candidates
        if candidate.quality_score >= minimum_quality and candidate.latency_p95_ms <= maximum_latency_ms
    ]
    if not eligible:
        raise ValueError("no_candidate_passes_policy")
    return min(
        eligible,
        key=lambda item: (
            item.estimated_cost_micro_units,
            -item.quality_score,
            item.latency_p95_ms,
        ),
    )


def public_candidate_report(candidate: CandidateResult, *, public_alias: str) -> dict[str, int | str]:
    digest = hashlib.sha256(
        (
            f"{candidate.protected_name}\0{candidate.quality_score}\0"
            f"{candidate.latency_p95_ms}\0{candidate.estimated_cost_micro_units}"
        ).encode()
    ).hexdigest()
    return {
        "model": public_alias,
        "policy_digest": digest,
        "quality_score": candidate.quality_score,
        "latency_p95_ms": candidate.latency_p95_ms,
        "estimated_cost_micro_units": candidate.estimated_cost_micro_units,
    }
