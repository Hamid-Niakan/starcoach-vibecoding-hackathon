from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator, MutableMapping
from typing import Any

import httpx
import orjson

from ai_gateway.grounding.citations import SAFE_ABSTENTION, CitationBuffer
from ai_gateway.grounding.index_client import IndexUnavailable
from ai_gateway.grounding.models import AnswerPath
from ai_gateway.grounding.orchestrator import GroundingOrchestrator, PreparedGrounding
from ai_gateway.grounding.usage import estimate_cost_micro_units
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
        grounding_orchestrator: GroundingOrchestrator | None = None,
    ) -> None:
        self.config = config
        self.provider = provider
        self.limiter = limiter
        self.prometheus = prometheus
        self.grounding_orchestrator = grounding_orchestrator

    def outbound_payload(
        self, request: ProxyChatCompletionRequest, grounding: PreparedGrounding | None = None
    ) -> dict[str, Any]:
        if request.model != self.config.model_name:
            raise ProxyException.invalid_model()
        payload = request.model_dump(exclude_none=True)
        payload["model"] = self.config.litellm_params.model
        if grounding is not None and grounding.prompt is not None:
            payload["messages"] = [dict(message) for message in grounding.prompt.messages]
            for field in (
                "tools",
                "functions",
                "tool_choice",
                "parallel_tool_calls",
                "function_call",
                "response_format",
            ):
                payload.pop(field, None)
        cap = request.max_completion_tokens or request.max_tokens or self.config.max_output_tokens
        if grounding is not None:
            route_cap = (
                self.config.complex_output_tokens
                if grounding.intent.value == "complex"
                else self.config.direct_output_tokens
            )
            cap = min(cap, route_cap)
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
        deadline = asyncio.get_running_loop().time() + (
            self.config.max_stream_seconds if request.stream else self.config.max_request_seconds
        )
        try:
            retrieval_started = time.monotonic()
            route_budget = (
                self.grounding_orchestrator.preview_budget(request) if self.grounding_orchestrator is not None else None
            )
            async with asyncio.timeout_at(deadline):
                grounding = (
                    await self.grounding_orchestrator.prepare(request, route_budget)
                    if self.grounding_orchestrator is not None
                    else None
                )
            retrieval_duration = time.monotonic() - retrieval_started
            if lifecycle_scope is not None and grounding is not None:
                lifecycle_scope["ai_gateway.grounding_route"] = grounding.intent.value
                lifecycle_scope["ai_gateway.revision_digest"] = grounding.revision[:16]
                lifecycle_scope["ai_gateway.retrieval_count"] = len(grounding.passages)
                lifecycle_scope["ai_gateway.retrieval_tokens"] = sum(item.token_estimate for item in grounding.passages)
                lifecycle_scope["ai_gateway.retrieval_seconds"] = retrieval_duration
                lifecycle_scope["ai_gateway.cache_outcome"] = "ineligible"
                lifecycle_scope["ai_gateway.budget_result"] = "allowed"
        except IndexUnavailable as exc:
            raise ProxyException(
                status_code=503,
                message="The documentation assistant is temporarily unavailable.",
                error_type="server_error",
                code="grounding_unavailable",
            ) from exc
        except TimeoutError as exc:
            raise ProxyException(
                status_code=504,
                message="The gateway request timed out.",
                error_type="server_error",
                code="request_timeout",
            ) from exc
        payload = self.outbound_payload(request, grounding)
        upstream_started = time.monotonic()
        reservation: UsageReservation | None = None
        response: httpx.Response | None = None
        reconciled = False
        stream_handed_off = False

        async def reconcile(
            actual_tokens: int | None = None,
            actual_cost_micro_units: int | None = None,
        ) -> None:
            nonlocal reconciled
            if reservation is not None and not reconciled:
                reconciled = True
                await self.limiter.reconcile(reservation, actual_tokens, actual_cost_micro_units)

        try:
            async with asyncio.timeout_at(deadline):
                reserved_tokens = (
                    grounding.budget.reserved_tokens
                    if grounding is not None
                    else reserved_token_count(request, self.config)
                )
                reserved_cost = (
                    estimate_cost_micro_units(
                        grounding.budget.generation_input_tokens + grounding.budget.planner_input_tokens,
                        grounding.budget.generation_output_tokens + grounding.budget.planner_output_tokens,
                        input_rate_micro_per_million=self.config.input_cost_micro_per_million,
                        output_rate_micro_per_million=self.config.output_cost_micro_per_million,
                    )
                    if grounding is not None
                    else 0
                )
                reservation = await self.limiter.reserve(client_id, reserved_tokens, reserved_cost)
                if lifecycle_scope is not None:
                    lifecycle_scope["ai_gateway.admission"] = "allowed"
                    lifecycle_scope["ai_gateway.charged_tokens"] = reservation.reserved_tokens
                if grounding is not None and grounding.fixed_answer is not None:
                    result = self._fixed_response(request, request_id, grounding)
                    if lifecycle_scope is not None:
                        lifecycle_scope["ai_gateway.input_tokens"] = grounding.planner_input_tokens
                        lifecycle_scope["ai_gateway.output_tokens"] = 1
                        lifecycle_scope["ai_gateway.charged_tokens"] = (
                            grounding.planner_input_tokens + grounding.planner_output_tokens + 1
                        )
                        lifecycle_scope["ai_gateway.estimated_cost_micro_units"] = estimate_cost_micro_units(
                            grounding.planner_input_tokens,
                            grounding.planner_output_tokens + 1,
                            input_rate_micro_per_million=self.config.input_cost_micro_per_million,
                            output_rate_micro_per_million=self.config.output_cost_micro_per_million,
                        )
                    if request.stream:
                        response = self._fixed_stream_response(result, grounding, upstream_started, deadline)
                        stream_handed_off = True
                        return response, reservation
                    fixed_tokens = grounding.planner_input_tokens + grounding.planner_output_tokens + 1
                    await reconcile(
                        fixed_tokens,
                        estimate_cost_micro_units(
                            grounding.planner_input_tokens,
                            grounding.planner_output_tokens + 1,
                            input_rate_micro_per_million=self.config.input_cost_micro_per_million,
                            output_rate_micro_per_million=self.config.output_cost_micro_per_million,
                        ),
                    )
                    return result, reservation
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
                if grounding is not None:
                    response.extensions["ai_gateway_grounding"] = grounding
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
                if grounding is not None:
                    content = _completion_content(result)
                    validated = grounding.finalize(content)
                    _set_completion_content(result, validated.content)
                    result["x_liara"] = grounding.metadata(validated)
                usage = extract_provider_usage(result)
                duration = time.monotonic() - upstream_started
                if lifecycle_scope is not None:
                    lifecycle_scope["ai_gateway.upstream_duration_seconds"] = duration
                if self.prometheus is not None:
                    self.prometheus.observe_upstream(UpstreamOutcome.SUCCESS, duration)
                if usage is not None:
                    if lifecycle_scope is not None:
                        planner_input = grounding.planner_input_tokens if grounding is not None else 0
                        planner_output = grounding.planner_output_tokens if grounding is not None else 0
                        lifecycle_scope["ai_gateway.input_tokens"] = usage.prompt_tokens + planner_input
                        lifecycle_scope["ai_gateway.output_tokens"] = usage.completion_tokens + planner_output
                        lifecycle_scope["ai_gateway.charged_tokens"] = (
                            usage.total_tokens + planner_input + planner_output
                        )
                        lifecycle_scope["ai_gateway.estimated_cost_micro_units"] = estimate_cost_micro_units(
                            usage.prompt_tokens + planner_input,
                            usage.completion_tokens + planner_output,
                            input_rate_micro_per_million=self.config.input_cost_micro_per_million,
                            output_rate_micro_per_million=self.config.output_cost_micro_per_million,
                        )
                    if self.prometheus is not None:
                        self.prometheus.record_token_usage(usage.prompt_tokens, usage.completion_tokens)
                reconciled_actual_tokens: int | None
                if usage is not None and grounding is not None:
                    reconciled_actual_tokens = (
                        usage.total_tokens + grounding.planner_input_tokens + grounding.planner_output_tokens
                    )
                    actual_cost = estimate_cost_micro_units(
                        usage.prompt_tokens + grounding.planner_input_tokens,
                        usage.completion_tokens + grounding.planner_output_tokens,
                        input_rate_micro_per_million=self.config.input_cost_micro_per_million,
                        output_rate_micro_per_million=self.config.output_cost_micro_per_million,
                    )
                else:
                    reconciled_actual_tokens = usage.total_tokens if usage else None
                    actual_cost = None
                await reconcile(reconciled_actual_tokens, actual_cost)
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

    def _fixed_response(
        self,
        request: ProxyChatCompletionRequest,
        request_id: str,
        grounding: PreparedGrounding,
    ) -> dict[str, Any]:
        validated = grounding.finalize(grounding.fixed_answer or SAFE_ABSTENTION)
        return {
            "id": f"chatcmpl-{request_id}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": self.config.model_name,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": validated.content},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 0, "completion_tokens": 1, "total_tokens": 1},
            "x_liara": grounding.metadata(validated),
        }

    def _fixed_stream_response(
        self,
        result: dict[str, Any],
        grounding: PreparedGrounding,
        started_at: float,
        deadline: float,
    ) -> httpx.Response:
        message = result["choices"][0]["message"]
        chunk = {
            "id": result["id"],
            "object": "chat.completion.chunk",
            "created": result["created"],
            "model": self.config.model_name,
            "choices": [{"index": 0, "delta": message, "finish_reason": "stop"}],
        }
        body = b"data: " + orjson.dumps(chunk) + b"\n\ndata: [DONE]\n\n"
        response = httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            content=body,
            request=httpx.Request("POST", "http://grounding.local/v1/chat/completions"),
        )
        response.extensions.update(
            {
                "ai_gateway_started_at": started_at,
                "ai_gateway_deadline": deadline,
                "ai_gateway_grounding": grounding,
                "ai_gateway_fixed_tokens": 1,
            }
        )
        return response

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
        actual_tokens: int | None = response.extensions.get("ai_gateway_fixed_tokens")
        grounding = response.extensions.get("ai_gateway_grounding")
        citation_buffer = (
            CitationBuffer(grounding.passages)
            if isinstance(grounding, PreparedGrounding) and grounding.answer_path is AnswerPath.GENERATED
            else None
        )
        rendered_content = ""
        terminal_template: dict[str, Any] | None = None
        first_content_seen = False
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
                        terminal_template = value
                        usage = extract_provider_usage(value)
                        if usage is not None:
                            actual_tokens = usage.total_tokens
                            if lifecycle_scope is not None:
                                lifecycle_scope["ai_gateway.input_tokens"] = usage.prompt_tokens
                                lifecycle_scope["ai_gateway.output_tokens"] = usage.completion_tokens
                                lifecycle_scope["ai_gateway.charged_tokens"] = usage.total_tokens
                        if citation_buffer is not None:
                            content = _stream_delta_content(value)
                            if content is not None:
                                rendered = citation_buffer.feed(content)
                                if not rendered:
                                    continue
                                rendered_content += rendered
                                _set_stream_delta_content(value, rendered)
                        if not first_content_seen and _stream_delta_content(value):
                            first_content_seen = True
                            if lifecycle_scope is not None:
                                lifecycle_scope["ai_gateway.ttft_seconds"] = max(
                                    0.0, time.monotonic() - float(response.extensions["ai_gateway_started_at"])
                                )
                        yield b"data: " + orjson.dumps(value) + b"\n\n"
                    if done:
                        break
                if done:
                    if isinstance(grounding, PreparedGrounding):
                        validated = (
                            citation_buffer.finish()
                            if citation_buffer is not None
                            else grounding.finalize(grounding.fixed_answer or SAFE_ABSTENTION)
                        )
                        if citation_buffer is not None:
                            tail = (
                                validated.content[len(rendered_content) :]
                                if validated.content.startswith(rendered_content)
                                else SAFE_ABSTENTION
                            )
                            if tail:
                                template = terminal_template or _stream_template(self.config.model_name)
                                delta = {
                                    **template,
                                    "choices": [{"index": 0, "delta": {"content": tail}, "finish_reason": None}],
                                }
                                delta.pop("usage", None)
                                yield b"data: " + orjson.dumps(delta) + b"\n\n"
                        terminal = terminal_template or _stream_template(self.config.model_name)
                        terminal = {
                            **terminal,
                            "choices": [],
                            "x_liara": grounding.metadata(validated),
                        }
                        terminal.pop("usage", None)
                        yield b"data: " + orjson.dumps(terminal) + b"\n\n"
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
                if actual_tokens is not None:
                    planner_input = grounding.planner_input_tokens if isinstance(grounding, PreparedGrounding) else 0
                    planner_output = grounding.planner_output_tokens if isinstance(grounding, PreparedGrounding) else 0
                    lifecycle_scope["ai_gateway.estimated_cost_micro_units"] = estimate_cost_micro_units(
                        int(lifecycle_scope.get("ai_gateway.input_tokens", 0)) + planner_input,
                        int(lifecycle_scope.get("ai_gateway.output_tokens", 0)) + planner_output,
                        input_rate_micro_per_million=self.config.input_cost_micro_per_million,
                        output_rate_micro_per_million=self.config.output_cost_micro_per_million,
                    )
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
            planner_input = grounding.planner_input_tokens if isinstance(grounding, PreparedGrounding) else 0
            planner_output = grounding.planner_output_tokens if isinstance(grounding, PreparedGrounding) else 0
            reconciled_tokens = (
                actual_tokens + planner_input + planner_output if done and actual_tokens is not None else None
            )
            reconciled_cost = (
                estimate_cost_micro_units(
                    int((lifecycle_scope or {}).get("ai_gateway.input_tokens", 0)) + planner_input,
                    int((lifecycle_scope or {}).get("ai_gateway.output_tokens", 0)) + planner_output,
                    input_rate_micro_per_million=self.config.input_cost_micro_per_million,
                    output_rate_micro_per_million=self.config.output_cost_micro_per_million,
                )
                if done and actual_tokens is not None
                else None
            )
            await self.limiter.reconcile(reservation, reconciled_tokens, reconciled_cost)


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


def _completion_content(value: dict[str, Any]) -> str:
    try:
        content = value["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProxyException(
            status_code=502,
            message="The upstream response was invalid.",
            error_type="server_error",
            code="invalid_upstream_response",
        ) from exc
    if not isinstance(content, str):
        raise ProxyException(
            status_code=502,
            message="The upstream response was invalid.",
            error_type="server_error",
            code="invalid_upstream_response",
        )
    return content


def _set_completion_content(value: dict[str, Any], content: str) -> None:
    value["choices"][0]["message"]["content"] = content


def _stream_delta_content(value: dict[str, Any]) -> str | None:
    choices = value.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    choice = choices[0]
    if not isinstance(choice, dict) or not isinstance(choice.get("delta"), dict):
        return None
    content = choice["delta"].get("content")
    return content if isinstance(content, str) else None


def _set_stream_delta_content(value: dict[str, Any], content: str) -> None:
    value["choices"][0]["delta"]["content"] = content


def _stream_template(model: str) -> dict[str, Any]:
    return {
        "id": "chatcmpl-grounded",
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [],
    }
