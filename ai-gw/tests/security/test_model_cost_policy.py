from __future__ import annotations

from ai_gateway.grounding.cost import CandidateResult, public_candidate_report, select_least_cost_passing


def test_selects_least_cost_candidate_that_passes_quality_and_latency() -> None:
    selected = select_least_cost_passing(
        [
            CandidateResult("protected-expensive", 94, 1400, 900),
            CandidateResult("protected-cheap", 92, 1200, 300),
            CandidateResult("protected-bad", 80, 800, 100),
        ],
        minimum_quality=90,
        maximum_latency_ms=1500,
    )
    assert selected.protected_name == "protected-cheap"


def test_public_candidate_report_never_leaks_protected_model_names() -> None:
    candidate = CandidateResult("provider/secret-model-v7", 92, 1200, 300)
    report = public_candidate_report(candidate, public_alias="liara-assistant")
    serialized = str(report)
    assert report["model"] == "liara-assistant"
    assert len(report["policy_digest"]) == 64
    assert "secret-model" not in serialized
    assert "provider/" not in serialized
