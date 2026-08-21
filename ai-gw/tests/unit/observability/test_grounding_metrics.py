from __future__ import annotations

import json

from prometheus_client import generate_latest

from ai_gateway.proxy.observability.events import BudgetResult, CacheOutcome, GroundingRoute
from ai_gateway.proxy.observability.logging import JsonEventFormatter
from ai_gateway.proxy.observability.prometheus import PrometheusLogger


def test_grounding_metrics_use_only_closed_bounded_labels() -> None:
    metrics = PrometheusLogger()
    metrics.observe_grounding(
        route=GroundingRoute.COMPLEX,
        retrieval_seconds=0.12,
        passage_count=4,
        retrieval_tokens=900,
        cache=CacheOutcome.MISS,
        ttft_seconds=0.4,
        estimated_cost_micro_units=42,
        budget=BudgetResult.ALLOWED,
    )
    body = generate_latest(metrics.registry).decode()
    assert 'route="complex"' in body and 'outcome="miss"' in body and 'result="allowed"' in body
    for canary in ("prompt-canary", "passage-canary", "private-model", "203.0.113.4"):
        assert canary not in body


def test_content_free_request_event_accepts_grounding_usage_fields() -> None:
    event = {
        "event": "request.completed",
        "severity": "info",
        "request_id": "11111111-1111-4111-8111-111111111111",
        "route": "chat",
        "model_name": "public",
        "model_match": True,
        "client_ref": "anon",
        "streaming": True,
        "admission": "allowed",
        "outcome": "success",
        "failure_category": None,
        "http_status": 200,
        "status_class": "2xx",
        "request_duration_seconds": 1.0,
        "upstream_duration_seconds": 0.8,
        "input_tokens": 10,
        "output_tokens": 5,
        "charged_tokens": 15,
        "retry_after_seconds": None,
        "grounding_route": "complex",
        "revision_digest": "a" * 16,
        "retrieval_count": 4,
        "retrieval_tokens": 900,
        "cache_outcome": "miss",
        "ttft_seconds": 0.4,
        "estimated_cost_micro_units": 42,
        "budget_result": "allowed",
    }
    record = type("Record", (), {"msg": event})()
    payload = json.loads(JsonEventFormatter().format(record))  # type: ignore[arg-type]
    assert payload["grounding_route"] == "complex" and payload["estimated_cost_micro_units"] == 42
    assert "message" not in payload and "passage" not in payload
