from __future__ import annotations

import asyncio

import pytest

from ai_gateway.proxy.enforcement.redis_store import RedisEnforcementStore
from ai_gateway.proxy.proxy_config import load_config
from tests.integration.redis_helpers import real_redis_store


@pytest.mark.performance
@pytest.mark.redis
@pytest.mark.parametrize(
    ("limits", "tokens", "cost"),
    [
        ({"global_rpm": 2}, 20, 0),
        ({"global_tpm": 40}, 20, 0),
        ({"global_quota_tokens": 40}, 20, 0),
        ({"global_max_concurrency": 2}, 20, 0),
        ({"daily_cost_budget_micro": 20}, 20, 10),
    ],
)
@pytest.mark.asyncio
async def test_two_replicas_share_every_atomic_boundary(
    gateway_env: dict[str, str],
    limits: dict[str, int],
    tokens: int,
    cost: int,
) -> None:
    base = load_config().model_copy(
        update={
            "global_rpm": 100,
            "global_tpm": 10_000,
            "global_quota_tokens": 10_000,
            "global_max_concurrency": 100,
            "daily_cost_budget_micro": 10_000,
            **limits,
        }
    )
    first = await real_redis_store(base)
    second = RedisEnforcementStore(first.config)
    await second.scripts.load()
    try:
        outcomes = await asyncio.gather(
            *((first if index % 2 else second).admit(f"client-{index}", tokens, cost) for index in range(5))
        )
        assert sum(decision.allowed for decision, _ in outcomes) == 2
    finally:
        await first.close()
        await second.close()


@pytest.mark.performance
@pytest.mark.redis
@pytest.mark.asyncio
async def test_token_and_cost_reconciliation_recovers_shared_capacity(
    gateway_env: dict[str, str],
) -> None:
    config = load_config().model_copy(
        update={
            "global_tpm": 40,
            "global_quota_tokens": 40,
            "daily_cost_budget_micro": 20,
            "global_max_concurrency": 10,
        }
    )
    first = await real_redis_store(config)
    second = RedisEnforcementStore(first.config)
    await second.scripts.load()
    try:
        _, reservation = await first.admit("client-a", 20, 10)
        assert reservation is not None
        second_decision, second_reservation = await second.admit("client-b", 20, 10)
        assert second_decision.allowed and second_reservation is not None
        denied, _ = await first.admit("client-c", 20, 10)
        assert not denied.allowed
        await second.reconcile(second_reservation, 1, 1)
        recovered, _ = await first.admit("client-c", 19, 9)
        assert recovered.allowed
    finally:
        await first.close()
        await second.close()
