from __future__ import annotations

import asyncio
import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from ai_gateway.proxy.auth.anonymous_identity import derive_anonymous_client_id
from ai_gateway.proxy.observability.events import RequestOutcome
from ai_gateway.proxy.observability.logging import ProxyLogging
from ai_gateway.proxy.observability.prometheus import PrometheusLogger
from ai_gateway.proxy.proxy_config import ProxyConfig


class InFlightRequestsMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        prometheus: PrometheusLogger | None = None,
        proxy_logging: ProxyLogging | None = None,
        config: ProxyConfig | None = None,
    ) -> None:
        self.app = app
        self.prometheus = prometheus
        self.proxy_logging = proxy_logging
        self.config = config
        self._in_flight = 0
        self._lock = asyncio.Lock()

    @property
    def in_flight(self) -> int:
        return self._in_flight

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        is_chat = scope.get("path") == "/v1/chat/completions" and scope.get("method") == "POST"
        if not is_chat:
            async with self._lock:
                self._in_flight += 1
            try:
                await self.app(scope, receive, send)
            finally:
                async with self._lock:
                    self._in_flight -= 1
            return
        async with self._lock:
            self._in_flight += 1
        if self.prometheus is not None:
            self.prometheus.request_started()
        started = time.monotonic()
        finalized = False
        status_code = 500
        disconnect_seen = False

        def final_outcome() -> RequestOutcome:
            explicit = scope.get("ai_gateway.outcome")
            if explicit:
                return RequestOutcome(explicit)
            if status_code < 400:
                return RequestOutcome.SUCCESS
            if status_code == 429:
                return RequestOutcome.RATE_LIMITED
            if status_code == 503:
                return RequestOutcome.STATE_UNAVAILABLE
            if status_code == 504:
                return RequestOutcome.TIMEOUT
            if status_code >= 500:
                return RequestOutcome.INTERNAL_ERROR
            return RequestOutcome.INVALID_REQUEST

        def finalize() -> None:
            nonlocal finalized
            if finalized:
                return
            finalized = True
            duration = max(0.0, time.monotonic() - started)
            outcome = final_outcome()
            if self.prometheus is not None:
                self.prometheus.request_finished(outcome, duration)
            if self.proxy_logging is not None and self.config is not None:
                peer = scope.get("client")
                peer_ip = peer[0] if peer else "0.0.0.0"
                try:
                    client_ref = derive_anonymous_client_id(peer_ip, self.config.identity_secret.get_secret_value())
                except ValueError:
                    client_ref = "identity-unavailable"
                self.proxy_logging.request_completed(
                    request_id=scope.get("ai_gateway.request_id", "00000000-0000-0000-0000-000000000000"),
                    route="chat",
                    model_name=scope.get("ai_gateway.model_name"),
                    model_match=scope.get("ai_gateway.model_match"),
                    client_ref=client_ref,
                    streaming=scope.get("ai_gateway.streaming"),
                    admission="allowed"
                    if status_code < 500 and outcome is RequestOutcome.SUCCESS
                    else scope.get("ai_gateway.admission", "not_evaluated"),
                    outcome=outcome.value,
                    failure_category=scope.get("ai_gateway.failure_category"),
                    http_status=status_code,
                    status_class=f"{status_code // 100}xx",
                    request_duration_seconds=duration,
                    upstream_duration_seconds=scope.get("ai_gateway.upstream_duration_seconds"),
                    input_tokens=scope.get("ai_gateway.input_tokens"),
                    output_tokens=scope.get("ai_gateway.output_tokens"),
                    charged_tokens=scope.get("ai_gateway.charged_tokens"),
                    retry_after_seconds=scope.get("ai_gateway.retry_after_seconds"),
                )

        async def lifecycle_send(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)
            if message["type"] == "http.response.body" and not message.get("more_body", False):
                finalize()

        async def lifecycle_receive() -> Message:
            nonlocal disconnect_seen
            message = await receive()
            if message["type"] == "http.disconnect":
                disconnect_seen = True
                scope["ai_gateway.outcome"] = RequestOutcome.CLIENT_CANCELLED.value
            return message

        try:
            await self.app(scope, lifecycle_receive, lifecycle_send)
        except asyncio.CancelledError:
            scope["ai_gateway.outcome"] = RequestOutcome.CLIENT_CANCELLED.value
            finalize()
            raise
        except OSError:
            scope["ai_gateway.outcome"] = RequestOutcome.CLIENT_CANCELLED.value
            finalize()
            raise
        except BaseException:
            finalize()
            raise
        finally:
            if disconnect_seen and status_code < 200:
                scope["ai_gateway.outcome"] = RequestOutcome.CLIENT_CANCELLED.value
            finalize()
            async with self._lock:
                self._in_flight -= 1
