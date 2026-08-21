from __future__ import annotations

import hashlib
import json
import uuid

from redis.asyncio import Redis
from redis.exceptions import RedisError

from ai_gateway.proxy.enforcement._types import (
    AdmissionDecision,
    AdmissionReason,
    ReconciliationOutcome,
    UsageReservation,
)
from ai_gateway.proxy.enforcement.redis_keys import EnforcementKeys
from ai_gateway.proxy.enforcement.redis_scripts import RedisScripts
from ai_gateway.proxy.enforcement.usage_policy import UsagePolicy
from ai_gateway.proxy.proxy_config import ProxyConfig


def enforcement_marker(config: ProxyConfig) -> str:
    values = {
        "contract": "v1",
        "deployment": config.deployment_id,
        "epoch": config.enforcement_epoch,
        "identity": hashlib.sha256(config.identity_secret.get_secret_value().encode()).hexdigest(),
        "input": config.model_max_input_tokens,
        "output": config.max_output_tokens,
        "client": UsagePolicy.client(config).__dict__
        if hasattr(UsagePolicy.client(config), "__dict__")
        else [
            config.client_rpm,
            config.client_tpm,
            config.client_max_concurrency,
            config.client_quota_tokens,
            config.client_quota_window_seconds,
        ],
        "global": [
            config.global_rpm,
            config.global_tpm,
            config.global_max_concurrency,
            config.global_quota_tokens,
            config.global_quota_window_seconds,
        ],
        "lifetime": [config.max_request_seconds, config.max_stream_seconds, config.reconciliation_grace_seconds],
        "cost": [
            config.input_cost_micro_per_million,
            config.output_cost_micro_per_million,
            config.daily_cost_budget_micro,
        ],
    }
    return hashlib.sha256(json.dumps(values, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


class RedisEnforcementStore:
    def __init__(self, config: ProxyConfig, redis: Redis | None = None) -> None:
        self.config = config
        self.redis = redis or Redis.from_url(
            config.redis_url.get_secret_value(),
            decode_responses=True,
            socket_connect_timeout=config.redis_timeout_seconds,
            socket_timeout=config.redis_timeout_seconds,
            retry_on_timeout=False,
        )
        self.keys = EnforcementKeys(config.deployment_id, config.enforcement_epoch)
        self.marker = enforcement_marker(config)
        self.scripts = RedisScripts(self.redis)

    async def start(self) -> None:
        await self.scripts.load()
        if not await self.readiness_check():
            raise RuntimeError("enforcement_marker_missing_or_mismatched")

    async def readiness_check(self) -> bool:
        try:
            if self.scripts.admit_sha is None or self.scripts.reconcile_sha is None:
                return False
            marker_matches = await self.redis.get(self.keys.marker) == self.marker
            scripts_exist = await self.redis.script_exists(self.scripts.admit_sha, self.scripts.reconcile_sha)
            return marker_matches and all(scripts_exist) and not bool(await self.redis.exists(self.keys.inconsistent))
        except RedisError:
            return False

    async def admit(
        self,
        client_id: str,
        reserved_tokens: int,
        reserved_cost_micro_units: int = 0,
    ) -> tuple[AdmissionDecision, UsageReservation | None]:
        reservation_id = str(uuid.uuid4())
        config = self.config
        lease = config.max_stream_seconds + config.reconciliation_grace_seconds
        args: list[object] = [
            self.marker,
            self.keys.prefix,
            client_id,
            reservation_id,
            reserved_tokens,
            lease,
            config.client_rpm,
            config.client_tpm,
            config.client_max_concurrency,
            config.client_quota_tokens,
            config.client_quota_window_seconds,
            config.global_rpm,
            config.global_tpm,
            config.global_max_concurrency,
            config.global_quota_tokens,
            config.global_quota_window_seconds,
            reserved_cost_micro_units,
            config.daily_cost_budget_micro,
        ]
        try:
            result = await self.scripts.eval_admit([self.keys.marker, self.keys.inconsistent], args)
        except RedisError:
            return AdmissionDecision(False, AdmissionReason.STATE_UNAVAILABLE, retry_after=1), None
        allowed = bool(int(result[0]))
        reason = AdmissionReason(result[1])
        retry = int(result[2]) or None
        if not allowed:
            return AdmissionDecision(False, reason, retry_after=retry), None
        return AdmissionDecision(True, reason, reservation_id=reservation_id), UsageReservation(
            reservation_id, reserved_tokens, reserved_cost_micro_units
        )

    async def reconcile(
        self,
        reservation: UsageReservation,
        actual_tokens: int | None,
        actual_cost_micro_units: int | None = None,
    ) -> ReconciliationOutcome:
        charged = reservation.reserved_tokens if actual_tokens is None else actual_tokens
        charged_cost = (
            reservation.reserved_cost_micro_units if actual_cost_micro_units is None else actual_cost_micro_units
        )
        try:
            result = await self.scripts.eval_reconcile(
                [self.keys.reservation(reservation.reservation_id), self.keys.inconsistent],
                [
                    charged,
                    reservation.reservation_id,
                    self.config.reconciliation_grace_seconds + 60,
                    charged_cost,
                ],
            )
        except RedisError:
            return ReconciliationOutcome.CONSERVATIVE
        value = result[0]
        return ReconciliationOutcome.DUPLICATE if value == "duplicate" else ReconciliationOutcome.ACTUAL

    async def close(self) -> None:
        await self.redis.aclose()
