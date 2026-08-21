from __future__ import annotations

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, disable_created_metrics

from ai_gateway.proxy.observability.events import (
    BudgetResult,
    CacheOutcome,
    FailureCategory,
    GroundingRoute,
    LimitScope,
    LimitType,
    LogDropReason,
    RequestOutcome,
    UpstreamOutcome,
)

LATENCY_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600)


class PrometheusLogger:
    def __init__(self, registry: CollectorRegistry | None = None) -> None:
        disable_created_metrics()  # type: ignore[no-untyped-call]
        self.registry = registry or CollectorRegistry(auto_describe=True)
        self.chat_requests_total = Counter(
            "ai_gateway_chat_requests", "Finalized chat requests.", ["outcome"], registry=self.registry
        )
        self.chat_requests_in_progress = Gauge(
            "ai_gateway_chat_requests_in_progress", "Chat requests currently in progress.", registry=self.registry
        )
        self.chat_request_duration_seconds = Histogram(
            "ai_gateway_chat_request_duration_seconds",
            "Full chat request duration.",
            ["outcome"],
            buckets=LATENCY_BUCKETS,
            registry=self.registry,
        )
        self.upstream_duration_seconds = Histogram(
            "ai_gateway_upstream_duration_seconds",
            "Full upstream request duration.",
            ["outcome"],
            buckets=LATENCY_BUCKETS,
            registry=self.registry,
        )
        self.upstream_failures_total = Counter(
            "ai_gateway_upstream_failures", "Upstream failures.", ["category"], registry=self.registry
        )
        self.limit_rejections_total = Counter(
            "ai_gateway_limit_rejections", "Authoritative limit rejections.", ["scope", "limit"], registry=self.registry
        )
        self.input_tokens_total = Counter(
            "ai_gateway_input_tokens", "Trustworthy provider input tokens.", registry=self.registry
        )
        self.output_tokens_total = Counter(
            "ai_gateway_output_tokens", "Trustworthy provider output tokens.", registry=self.registry
        )
        self.ready = Gauge(
            "ai_gateway_ready", "Whether correct admission decisions can be made.", registry=self.registry
        )
        self.log_events_dropped_total = Counter(
            "ai_gateway_log_events_dropped", "Structured log events dropped.", ["reason"], registry=self.registry
        )
        self.grounding_retrieval_duration_seconds = Histogram(
            "ai_gateway_grounding_retrieval_duration_seconds",
            "Documentation retrieval duration.",
            ["route"],
            buckets=LATENCY_BUCKETS,
            registry=self.registry,
        )
        self.grounding_retrieved_passages = Histogram(
            "ai_gateway_grounding_retrieved_passages",
            "Selected documentation passage count.",
            ["route"],
            buckets=(0, 1, 2, 4, 8, 12),
            registry=self.registry,
        )
        self.grounding_retrieval_tokens_total = Counter(
            "ai_gateway_grounding_retrieval_tokens", "Selected retrieval tokens.", ["route"], registry=self.registry
        )
        self.grounding_ttft_seconds = Histogram(
            "ai_gateway_grounding_ttft_seconds",
            "Time to first grounded content.",
            ["route"],
            buckets=LATENCY_BUCKETS,
            registry=self.registry,
        )
        self.grounding_cache_total = Counter(
            "ai_gateway_grounding_cache", "Grounding cache outcomes.", ["outcome"], registry=self.registry
        )
        self.estimated_cost_micro_units_total = Counter(
            "ai_gateway_estimated_cost_micro_units",
            "Estimated request cost in configured micro-units.",
            ["route"],
            registry=self.registry,
        )
        self.daily_cost_budget_micro_units = Gauge(
            "ai_gateway_daily_cost_budget_micro_units",
            "Configured daily estimated-cost budget.",
            registry=self.registry,
        )
        self.grounding_budget_total = Counter(
            "ai_gateway_grounding_budget", "Grounding budget outcomes.", ["route", "result"], registry=self.registry
        )
        for request_outcome in RequestOutcome:
            self.chat_requests_total.labels(request_outcome.value)
            self.chat_request_duration_seconds.labels(request_outcome.value)
        for upstream_outcome in UpstreamOutcome:
            self.upstream_duration_seconds.labels(upstream_outcome.value)
        for category in FailureCategory:
            self.upstream_failures_total.labels(category.value)
        for scope in LimitScope:
            for limit in LimitType:
                self.limit_rejections_total.labels(scope.value, limit.value)
        for reason in LogDropReason:
            self.log_events_dropped_total.labels(reason.value)
        for route in GroundingRoute:
            self.grounding_retrieval_duration_seconds.labels(route.value)
            self.grounding_retrieved_passages.labels(route.value)
            self.grounding_retrieval_tokens_total.labels(route.value)
            self.grounding_ttft_seconds.labels(route.value)
            self.estimated_cost_micro_units_total.labels(route.value)
            for result in BudgetResult:
                self.grounding_budget_total.labels(route.value, result.value)
        for outcome in CacheOutcome:
            self.grounding_cache_total.labels(outcome.value)
        self.ready.set(0)

    def request_started(self) -> None:
        self.chat_requests_in_progress.inc()

    def request_finished(self, outcome: RequestOutcome, duration_seconds: float) -> None:
        self.chat_requests_in_progress.dec()
        self.chat_requests_total.labels(outcome.value).inc()
        self.chat_request_duration_seconds.labels(outcome.value).observe(max(0.0, duration_seconds))

    def observe_upstream(self, outcome: UpstreamOutcome, duration_seconds: float) -> None:
        self.upstream_duration_seconds.labels(outcome.value).observe(max(0.0, duration_seconds))

    def record_upstream_failure(self, category: FailureCategory) -> None:
        self.upstream_failures_total.labels(category.value).inc()

    def record_limit_rejection(self, scope: LimitScope, limit: LimitType) -> None:
        self.limit_rejections_total.labels(scope.value, limit.value).inc()

    def record_token_usage(self, input_tokens: int, output_tokens: int) -> None:
        if input_tokens < 0 or output_tokens < 0:
            raise ValueError("negative_token_usage")
        self.input_tokens_total.inc(input_tokens)
        self.output_tokens_total.inc(output_tokens)

    def set_readiness(self, is_ready: bool) -> None:
        self.ready.set(1 if is_ready else 0)

    def set_daily_cost_budget(self, micro_units: int) -> None:
        if micro_units <= 0:
            raise ValueError("invalid_daily_cost_budget")
        self.daily_cost_budget_micro_units.set(micro_units)

    def record_log_drop(self, reason: LogDropReason) -> None:
        self.log_events_dropped_total.labels(reason.value).inc()

    def observe_grounding(
        self,
        *,
        route: GroundingRoute,
        retrieval_seconds: float,
        passage_count: int,
        retrieval_tokens: int,
        cache: CacheOutcome,
        ttft_seconds: float,
        estimated_cost_micro_units: int,
        budget: BudgetResult,
    ) -> None:
        if passage_count < 0 or retrieval_tokens < 0 or estimated_cost_micro_units < 0:
            raise ValueError("negative_grounding_observation")
        self.grounding_retrieval_duration_seconds.labels(route.value).observe(max(0.0, retrieval_seconds))
        self.grounding_retrieved_passages.labels(route.value).observe(passage_count)
        self.grounding_retrieval_tokens_total.labels(route.value).inc(retrieval_tokens)
        self.grounding_cache_total.labels(cache.value).inc()
        self.grounding_ttft_seconds.labels(route.value).observe(max(0.0, ttft_seconds))
        self.estimated_cost_micro_units_total.labels(route.value).inc(estimated_cost_micro_units)
        self.grounding_budget_total.labels(route.value, budget.value).inc()
