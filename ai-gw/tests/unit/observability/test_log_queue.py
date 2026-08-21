from __future__ import annotations

import logging

from ai_gateway.proxy.observability.log_queue import LoggingRuntime
from ai_gateway.proxy.observability.prometheus import PrometheusLogger


def test_bounded_queue_drops_new_without_blocking() -> None:
    metrics = PrometheusLogger()
    runtime = LoggingRuntime(metrics, capacity=1)
    record = logging.LogRecord(
        "ai_gateway", logging.INFO, "", 0, {"event": "service.ready", "severity": "info"}, (), None
    )
    runtime.queue_handler.emit(record)
    runtime.queue_handler.emit(record)
    assert runtime.queue.qsize() == 1
    assert metrics.log_events_dropped_total.labels("queue_full")._value.get() == 1
