from __future__ import annotations

from ai_gateway.proxy.enforcement._types import ReconciliationOutcome, UsageReservation
from ai_gateway.proxy.enforcement.redis_store import RedisEnforcementStore
from ai_gateway.proxy.errors import ProxyException
from ai_gateway.proxy.observability.events import LimitScope, LimitType
from ai_gateway.proxy.observability.prometheus import PrometheusLogger


class ParallelRequestLimiter:
    def __init__(self, store: RedisEnforcementStore, prometheus: PrometheusLogger | None = None) -> None:
        self.store = store
        self.prometheus = prometheus

    async def reserve(self, client_id: str, token_count: int) -> UsageReservation:
        decision, reservation = await self.store.admit(client_id, token_count)
        if not decision.allowed or reservation is None:
            if decision.reason.value.startswith("state_"):
                if self.prometheus is not None:
                    self.prometheus.set_readiness(False)
                raise ProxyException(
                    status_code=503,
                    message="Correct request enforcement is temporarily unavailable.",
                    error_type="server_error",
                    code=decision.reason.value,
                    retry_after=decision.retry_after,
                )
            scope_value, limit_value = decision.reason.value.split("_", 1)
            if self.prometheus is not None:
                self.prometheus.record_limit_rejection(LimitScope(scope_value), LimitType(limit_value))
            raise ProxyException(
                status_code=429,
                message="The anonymous usage limit has been reached.",
                error_type="rate_limit_error",
                code=decision.reason.value,
                retry_after=decision.retry_after,
            )
        if self.prometheus is not None:
            self.prometheus.set_readiness(True)
        return reservation

    async def reconcile(self, reservation: UsageReservation, actual_tokens: int | None = None) -> None:
        outcome = await self.store.reconcile(reservation, actual_tokens)
        if outcome is ReconciliationOutcome.CONSERVATIVE and self.prometheus is not None:
            self.prometheus.set_readiness(False)
