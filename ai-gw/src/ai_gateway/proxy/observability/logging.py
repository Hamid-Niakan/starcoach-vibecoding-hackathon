from __future__ import annotations

import datetime as dt
import logging
import math
import re
from typing import Any

import orjson

from ai_gateway.proxy.observability.events import LogEvent, Severity

COMMON_FIELDS = {"schema_version", "timestamp", "severity", "event", "service"}
REQUEST_FIELDS = {
    "request_id",
    "route",
    "model_name",
    "model_match",
    "client_ref",
    "streaming",
    "admission",
    "outcome",
    "failure_category",
    "http_status",
    "status_class",
    "request_duration_seconds",
    "upstream_duration_seconds",
    "input_tokens",
    "output_tokens",
    "charged_tokens",
    "retry_after_seconds",
}
LIFECYCLE_FIELDS = {
    "deployment_id",
    "enforcement_epoch",
    "config_schema_version",
    "reason",
    "in_progress_requests",
    "drain_deadline_seconds",
    "readiness",
    "category",
}
ALLOWED_FIELDS = COMMON_FIELDS | REQUEST_FIELDS | LIFECYCLE_FIELDS
CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")
VALID_EVENTS = {item.value for item in LogEvent}
VALID_SEVERITIES = {item.value for item in Severity}


def _safe_string(value: str, maximum: int = 256) -> str:
    return CONTROL_CHARACTERS.sub(" ", value)[:maximum]


def sanitize_event(event: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for key, value in event.items():
        if key not in ALLOWED_FIELDS:
            continue
        if isinstance(value, str):
            clean[key] = _safe_string(value, 128 if key in {"request_id", "client_ref"} else 256)
        elif value is None or isinstance(value, bool) or (isinstance(value, int) and not isinstance(value, bool)):
            clean[key] = value
        elif isinstance(value, float) and math.isfinite(value):
            clean[key] = value
    clean.update(
        schema_version=1,
        timestamp=dt.datetime.now(dt.UTC).isoformat(timespec="microseconds").replace("+00:00", "Z"),
        service="ai-gateway",
    )
    return clean


class JsonEventFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        if not isinstance(record.msg, dict):
            raise ValueError("structured_event_required")
        event = sanitize_event(record.msg)
        if event.get("event") not in VALID_EVENTS or event.get("severity") not in VALID_SEVERITIES:
            raise ValueError("invalid_event_envelope")
        if event["event"] == LogEvent.REQUEST_COMPLETED.value:
            required = {
                "request_id",
                "route",
                "model_match",
                "client_ref",
                "streaming",
                "admission",
                "outcome",
                "failure_category",
                "http_status",
                "status_class",
                "request_duration_seconds",
                "upstream_duration_seconds",
                "input_tokens",
                "output_tokens",
                "charged_tokens",
                "retry_after_seconds",
            }
            if not required.issubset(event):
                raise ValueError("incomplete_request_event")
        return orjson.dumps(event).decode("utf-8")


class ProxyLogging:
    def __init__(self, logger: logging.Logger) -> None:
        self.logger = logger

    def emit(self, event: dict[str, Any]) -> None:
        severity = str(event.get("severity", Severity.INFO.value)).upper()
        self.logger.log(getattr(logging, severity, logging.INFO), event)

    def request_completed(self, **fields: Any) -> None:
        self.emit({"event": LogEvent.REQUEST_COMPLETED.value, "severity": Severity.INFO.value, **fields})
