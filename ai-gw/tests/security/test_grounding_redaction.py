from __future__ import annotations

import json
import logging

from prometheus_client import generate_latest

from ai_gateway.proxy.observability.logging import JsonEventFormatter, sanitize_event
from ai_gateway.proxy.observability.prometheus import PrometheusLogger

CANARIES = (
    "seed-secret-AI_GATEWAY_API_KEY",
    "seed-private-provider-model",
    "seed user message body",
    "seed retrieved passage body",
    "203.0.113.77",
)


def test_seeded_content_and_identity_canaries_are_dropped_from_logs_and_metrics() -> None:
    event = sanitize_event(
        {
            "event": "request.completed",
            "severity": "info",
            "request_id": "11111111-1111-4111-8111-111111111111",
            "route": "chat",
            "prompt": CANARIES[2],
            "passage": CANARIES[3],
            "provider_model": CANARIES[1],
            "secret": CANARIES[0],
            "ip": CANARIES[4],
            "outcome": "success",
        }
    )
    encoded = json.dumps(event)
    metrics = generate_latest(PrometheusLogger().registry).decode()
    assert all(canary not in encoded and canary not in metrics for canary in CANARIES)


def test_formatter_rejects_unstructured_canary_bearing_messages() -> None:
    record = logging.LogRecord("test", logging.INFO, __file__, 1, CANARIES[2], (), None)
    try:
        JsonEventFormatter().format(record)
    except ValueError as error:
        assert str(error) == "structured_event_required"
    else:
        raise AssertionError("unstructured log content must be rejected")
