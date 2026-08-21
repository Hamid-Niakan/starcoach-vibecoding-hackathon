from __future__ import annotations

import os
import time
import uuid

import pytest

from ai_gateway.proxy.observability.events import RequestOutcome
from ai_gateway.proxy.observability.log_queue import LoggingRuntime
from ai_gateway.proxy.observability.prometheus import PrometheusLogger


@pytest.mark.performance
def test_monitoring_overhead_and_1000_correlations_are_bounded() -> None:
    if os.getenv("RUN_PERFORMANCE") != "1":
        pytest.skip("set RUN_PERFORMANCE=1 for the explicit performance gate")
    metrics = PrometheusLogger()
    runtime = LoggingRuntime(metrics, capacity=1100)
    started = time.perf_counter()
    request_ids = [str(uuid.uuid4()) for _ in range(1000)]
    for request_id in request_ids:
        metrics.request_started()
        metrics.request_finished(RequestOutcome.SUCCESS, 0.001)
        runtime.proxy_logging.request_completed(
            request_id=request_id,
            route="chat",
            model_match=True,
            client_ref="bounded-client-ref",
            streaming=False,
            admission="allowed",
            outcome="success",
            failure_category=None,
            http_status=200,
            status_class="2xx",
            request_duration_seconds=0.001,
            upstream_duration_seconds=0.001,
            input_tokens=1,
            output_tokens=1,
            charged_tokens=2,
            retry_after_seconds=None,
        )
    elapsed = time.perf_counter() - started
    assert metrics.chat_requests_total.labels("success")._value.get() == 1000
    assert metrics.chat_requests_in_progress._value.get() == 0
    queued_ids = [runtime.queue.get_nowait().msg["request_id"] for _ in range(1000)]
    assert queued_ids == request_ids
    assert elapsed < 1.0

    pressured = LoggingRuntime(metrics, capacity=1)
    pressured.proxy_logging.emit({"event": "service.ready", "severity": "info"})
    pressured.proxy_logging.emit({"event": "service.ready", "severity": "info"})
    assert metrics.log_events_dropped_total.labels("queue_full")._value.get() == 1
