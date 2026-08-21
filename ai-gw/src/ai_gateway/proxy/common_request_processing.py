from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator, MutableMapping
from typing import Any

import httpx
import orjson

from ai_gateway.proxy._types import ModelResponse, ModelResponseStream, ProxyChatCompletionRequest
from ai_gateway.proxy.enforcement._types import UsageReservation
from ai_gateway.proxy.enforcement.parallel_request_limiter import ParallelRequestLimiter
from ai_gateway.proxy.enforcement.usage_estimator import extract_provider_usage, reserved_token_count
from ai_gateway.proxy.errors import ProxyException
from ai_gateway.proxy.observability.events import FailureCategory, UpstreamOutcome
from ai_gateway.proxy.observability.prometheus import PrometheusLogger
from ai_gateway.proxy.providers.openai_compatible import OpenAICompatible, bounded_response_body
from ai_gateway.proxy.proxy_config import ProxyConfig


class ProxyBaseLLMRequestProcessing:
    def __init__(
        self,
        config: ProxyConfig,
        provider: OpenAICompatible,
        limiter: ParallelRequestLimiter,
        prometheus: PrometheusLogger | None = None,
    ) -> None:
        self.config = config
        self.provider = provider
        self.limiter = limiter
        self.prometheus = prometheus

    def outbound_payload(self, request: ProxyChatCompletionRequest) -> dict[str, Any]:
        if request.model != self.config.model_name:
            raise ProxyException.invalid_model()
        payload = request.model_dump(exclude_none=True)
        payload["model"] = self.config.litellm_params.model
        cap = request.max_completion_tokens or request.max_tokens or self.config.max_output_tokens
        cap = min(cap, self.config.max_output_tokens)
        payload.pop("max_tokens", None)
        payload["max_completion_tokens"] = cap
        if request.stream:
            payload["stream_options"] = {"include_usage": True}
        return payload

    async def create_response(
        self,
        request: ProxyChatCompletionRequest,
        request_id: str,
        client_id: str,
        lifecycle_scope: MutableMapping[str, Any] | None = None,
    ) -> tuple[dict[str, Any] | httpx.Response, UsageReservation]:
        payload = self.outbound_payload(request)
        upstream_started = time.monotonic()
        deadline = asyncio.get_running_loop().time() + (
            self.config.max_stream_seconds if request.stream else self.config.max_request_seconds
        )
        reservation: UsageReservation | None = None
        response: httpx.Response | None = None
        reconciled = False
        stream_handed_off = False

        async def reconcile(actual_tokens: int | None = None) -> None:
            nonlocal reconciled
            if reservation is not None and not reconciled:
                reconciled = True
                await self.limiter.reconcile(reservation, actual_tokens)

        try:
            async with asyncio.timeout_at(deadline):
                reservation = await self.limiter.reserve(client_id, reserved_token_count(request, self.config))
                if lifecycle_scope is not None:
                    lifecycle_scope["ai_gateway.admission"] = "allowed"
                    lifecycle_scope["ai_gateway.charged_tokens"] = reservation.reserved_tokens
                try:
                    response = await self.provider.send(
                        payload, request_id, streaming=bool(request.stream), deadline=deadline
                    )
                except (TimeoutError, asyncio.CancelledError):
                    raise
                except BaseException:
                    duration = time.monotonic() - upstream_started
                    if lifecycle_scope is not None:
                        lifecycle_scope["ai_gateway.upstream_duration_seconds"] = duration
                    if self.prometheus is not None:
                        self.prometheus.observe_upstream(UpstreamOutcome.CONNECT_ERROR, duration)
                        self.prometheus.record_upstream_failure(FailureCategory.CONNECT)
                    raise

                response.extensions["ai_gateway_started_at"] = upstream_started
                response.extensions["ai_gateway_deadline"] = deadline
                if response.status_code != 200:
                    duration = time.monotonic() - upstream_started
                    if lifecycle_scope is not None:
                        lifecycle_scope["ai_gateway.upstream_duration_seconds"] = duration
                    if self.prometheus is not None:
                        self.prometheus.observe_upstream(UpstreamOutcome.HTTP_ERROR, duration)
                        self.prometheus.record_upstream_failure(
                            FailureCategory.HTTP_4XX if response.status_code < 500 else FailureCategory.HTTP_5XX
                        )
                    status = 429 if response.status_code == 429 else 502
                    code = "rate_limit_exceeded" if status == 429 else "upstream_error"
                    raise ProxyException(
                        status_code=status,
                        message="The upstream service rejected the request.",
                        error_type="server_error",
                        code=code,
                    )
                if request.stream:
                    content_encoding = response.headers.get("content-encoding", "identity").lower()
                    if content_encoding not in {"", "identity"}:
                        raise ProxyException(
                            status_code=502,
                            message="The upstream response was invalid.",
                            error_type="server_error",
                            code="upstream_encoding",
                        )
                    stream_handed_off = True
                    return response, reservation

                raw = await bounded_response_body(response, self.config.max_response_bytes)
                try:
                    value = orjson.loads(raw)
                    parsed = ModelResponse.model_validate(value)
                except (orjson.JSONDecodeError, ValueError) as exc:
                    raise ProxyException(
                        status_code=502,
                        message="The upstream response was invalid.",
                        error_type="server_error",
                        code="invalid_upstream_response",
                    ) from exc
                result = parsed.model_dump(exclude_none=True)
                result["model"] = self.config.model_name
                usage = extract_provider_usage(result)
                duration = time.monotonic() - upstream_started
                if lifecycle_scope is not None:
                    lifecycle_scope["ai_gateway.upstream_duration_seconds"] = duration
                if self.prometheus is not None:
                    self.prometheus.observe_upstream(UpstreamOutcome.SUCCESS, duration)
                if usage is not None:
                    if lifecycle_scope is not None:
                        lifecycle_scope["ai_gateway.input_tokens"] = usage.prompt_tokens
                        lifecycle_scope["ai_gateway.output_tokens"] = usage.completion_tokens
                        lifecycle_scope["ai_gateway.charged_tokens"] = usage.total_tokens
                    if self.prometheus is not None:
                        self.prometheus.record_token_usage(usage.prompt_tokens, usage.completion_tokens)
                await reconcile(usage.total_tokens if usage else None)
                return result, reservation
        except TimeoutError as exc:
            duration = time.monotonic() - upstream_started
            if lifecycle_scope is not None:
                lifecycle_scope["ai_gateway.upstream_duration_seconds"] = duration
            if self.prometheus is not None:
                self.prometheus.observe_upstream(UpstreamOutcome.TIMEOUT, duration)
                self.prometheus.record_upstream_failure(FailureCategory.TOTAL_TIMEOUT)
            await reconcile()
            raise ProxyException(
                status_code=504,
                message="The gateway request timed out.",
                error_type="server_error",
                code="request_timeout",
            ) from exc
        except BaseException:
            await reconcile()
            raise
        finally:
            if response is not None and not stream_handed_off:
                await response.aclose()

    async def stream_response(
        self,
        response: httpx.Response,
        reservation: UsageReservation,
        lifecycle_scope: MutableMapping[str, Any] | None = None,
    ) -> AsyncIterator[bytes]:
        buffer = bytearray()
        total = 0
        events = 0
        done = False
        actual_tokens: int | None = None
        try:
            deadline = float(response.extensions["ai_gateway_deadline"])
            async with asyncio.timeout_at(deadline):
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if total > self.config.max_stream_bytes:
                        raise ProxyException(
                            status_code=502,
                            message="The upstream stream exceeded its limit.",
                            error_type="server_error",
                            code="upstream_stream_too_large",
                        )
                    buffer.extend(chunk)
                    if len(buffer) > self.config.max_sse_buffer_bytes:
                        raise ProxyException(
                            status_code=502,
                            message="The upstream stream was invalid.",
                            error_type="server_error",
                            code="invalid_upstream_stream",
                        )
                    while (boundary := _event_boundary(buffer)) is not None:
                        raw_event = bytes(buffer[:boundary])
                        del buffer[: boundary + _boundary_length(buffer, boundary)]
                        if not raw_event.strip():
                            continue
                        events += 1
                        if events > self.config.max_stream_events or len(raw_event) > self.config.max_sse_event_bytes:
                            raise ProxyException(
                                status_code=502,
                                message="The upstream stream exceeded its limit.",
                                error_type="server_error",
                                code="upstream_stream_too_large",
                            )
                        data = _event_data(raw_event)
                        if data == b"[DONE]":
                            done = True
                            break
                        if data is None:
                            continue
                        try:
                            parsed = ModelResponseStream.model_validate(orjson.loads(data))
                        except (orjson.JSONDecodeError, ValueError) as exc:
                            raise ProxyException(
                                status_code=502,
                                message="The upstream stream was invalid.",
                                error_type="server_error",
                                code="invalid_upstream_stream",
                            ) from exc
                        value = parsed.model_dump(exclude_none=True)
                        value["model"] = self.config.model_name
                        usage = extract_provider_usage(value)
                        if usage is not None:
                            actual_tokens = usage.total_tokens
                            if lifecycle_scope is not None:
                                lifecycle_scope["ai_gateway.input_tokens"] = usage.prompt_tokens
                                lifecycle_scope["ai_gateway.output_tokens"] = usage.completion_tokens
                                lifecycle_scope["ai_gateway.charged_tokens"] = usage.total_tokens
                        yield b"data: " + orjson.dumps(value) + b"\n\n"
                    if done:
                        break
                if done:
                    yield b"data: [DONE]\n\n"
        except (TimeoutError, ProxyException, httpx.HTTPError):
            # Streaming headers have already been committed. Ending without the public marker is
            # the only safe, sanitized signal available to an OpenAI-compatible client.
            done = False
        finally:
            await response.aclose()
            duration = time.monotonic() - float(response.extensions.get("ai_gateway_started_at", time.monotonic()))
            if lifecycle_scope is not None:
                lifecycle_scope["ai_gateway.upstream_duration_seconds"] = duration
            if self.prometheus is not None:
                self.prometheus.observe_upstream(
                    UpstreamOutcome.SUCCESS if done else UpstreamOutcome.MALFORMED_RESPONSE, duration
                )
                if done and actual_tokens is not None:
                    usage_values = lifecycle_scope or {}
                    self.prometheus.record_token_usage(
                        int(usage_values.get("ai_gateway.input_tokens", 0)),
                        int(usage_values.get("ai_gateway.output_tokens", 0)),
                    )
            await self.limiter.reconcile(reservation, actual_tokens if done else None)


def _event_boundary(buffer: bytearray) -> int | None:
    positions = [index for marker in (b"\n\n", b"\r\n\r\n") if (index := buffer.find(marker)) >= 0]
    return min(positions) if positions else None


def _boundary_length(buffer: bytearray, index: int) -> int:
    return 4 if bytes(buffer[index : index + 4]) == b"\r\n\r\n" else 2


def _event_data(event: bytes) -> bytes | None:
    values: list[bytes] = []
    for line in event.replace(b"\r\n", b"\n").split(b"\n"):
        if line.startswith(b"data:"):
            values.append(line[5:].lstrip(b" "))
    return b"\n".join(values) if values else None
