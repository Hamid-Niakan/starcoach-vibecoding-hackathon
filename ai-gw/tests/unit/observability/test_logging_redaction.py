from __future__ import annotations

import json
import logging

from ai_gateway.proxy.observability.logging import JsonEventFormatter, sanitize_event


def test_schema_first_allowlist_drops_sensitive_and_normalizes_control_characters() -> None:
    event = sanitize_event(
        {
            "event": "request.completed",
            "severity": "info",
            "request_id": "safe\r\nforged",
            "messages": "SECRET_CONTENT",
            "authorization": "SECRET_KEY",
            "exception": "SECRET_ERROR",
            "route": "chat",
        }
    )
    rendered = json.dumps(event)
    assert "SECRET" not in rendered and "\n" not in event["request_id"]
    assert set(event) <= {"schema_version", "timestamp", "severity", "event", "service", "request_id", "route"}


def test_formatter_outputs_one_json_object() -> None:
    record = logging.LogRecord(
        "ai_gateway", logging.INFO, "", 0, {"event": "service.ready", "severity": "info"}, (), None
    )
    parsed = json.loads(JsonEventFormatter().format(record))
    assert parsed["schema_version"] == 1 and parsed["service"] == "ai-gateway"
