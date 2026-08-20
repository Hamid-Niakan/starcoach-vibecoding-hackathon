from __future__ import annotations

import logging
import queue
import sys
import time
from logging.handlers import QueueListener
from typing import Any

from ai_gateway.proxy.observability.events import LogDropReason
from ai_gateway.proxy.observability.logging import JsonEventFormatter, ProxyLogging
from ai_gateway.proxy.observability.prometheus import PrometheusLogger


class NonBlockingQueueHandler(logging.Handler):
    def __init__(self, event_queue: queue.Queue[logging.LogRecord], metrics: PrometheusLogger) -> None:
        super().__init__()
        self.event_queue = event_queue
        self.metrics = metrics
        self._last_notice = 0.0

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self.event_queue.put_nowait(record)
        except queue.Full:
            self.metrics.record_log_drop(LogDropReason.QUEUE_FULL)
            self.emit_degradation_notice()

    def emit_degradation_notice(self) -> None:
        now = time.monotonic()
        if now - self._last_notice >= 60:
            self._last_notice = now
            try:
                sys.stderr.write("ai-gateway logging degraded; events may be dropped\n")
            except Exception:
                pass


class SafeStreamHandler(logging.StreamHandler[Any]):
    def __init__(self, metrics: PrometheusLogger) -> None:
        super().__init__(sys.stdout)
        self.metrics = metrics
        self.setFormatter(JsonEventFormatter())

    def handleError(self, record: logging.LogRecord) -> None:
        active_error = sys.exc_info()[1]
        reason = (
            LogDropReason.SERIALIZATION_ERROR
            if isinstance(active_error, (TypeError, ValueError, UnicodeError))
            else LogDropReason.SINK_ERROR
        )
        self.metrics.record_log_drop(reason)


class LoggingRuntime:
    def __init__(self, metrics: PrometheusLogger, capacity: int, level: str = "INFO") -> None:
        self.metrics = metrics
        self.queue: queue.Queue[logging.LogRecord] = queue.Queue(maxsize=capacity)
        self.queue_handler = NonBlockingQueueHandler(self.queue, metrics)
        self.sink_handler = SafeStreamHandler(metrics)
        self.listener = QueueListener(self.queue, self.sink_handler, respect_handler_level=True)
        logger = logging.getLogger("ai_gateway")
        logger.handlers.clear()
        logger.propagate = False
        logger.setLevel(getattr(logging, level.upper(), logging.INFO))
        logger.addHandler(self.queue_handler)
        self.proxy_logging = ProxyLogging(logger)

    def start(self) -> None:
        self.listener.start()

    def stop(self, timeout_seconds: float = 1.0) -> None:
        thread = self.listener._thread
        if thread is None:
            return
        try:
            self.listener.enqueue_sentinel()
        except queue.Full:
            dropped = 0
            while True:
                try:
                    self.queue.get_nowait()
                    dropped += 1
                except queue.Empty:
                    break
            if dropped:
                self.metrics.log_events_dropped_total.labels(LogDropReason.QUEUE_FULL.value).inc(dropped)
            self.listener.enqueue_sentinel()
        thread.join(timeout=max(0.0, timeout_seconds))
        if thread.is_alive():
            self.queue_handler.emit_degradation_notice()
        else:
            self.listener._thread = None
