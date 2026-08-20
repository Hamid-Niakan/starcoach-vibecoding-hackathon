from __future__ import annotations

import os

import pytest

from ai_gateway.proxy.enforcement._types import ReconciliationOutcome
from ai_gateway.proxy.proxy_config import load_config
from tests.integration.redis_helpers import real_redis_store


@pytest.mark.redis
@pytest.mark.integration
@pytest.mark.asyncio
async def test_reconciliation_is_idempotent_and_releases_lease(gateway_env: dict[str, str]) -> None:
    store = await real_redis_store(load_config())
    try:
        decision, reservation = await store.admit("client", 20)
        assert decision.allowed and reservation is not None
        assert await store.reconcile(reservation, 4) is ReconciliationOutcome.ACTUAL
        assert await store.reconcile(reservation, 4) is ReconciliationOutcome.DUPLICATE
    finally:
        await store.close()


@pytest.mark.redis
@pytest.mark.integration
@pytest.mark.asyncio
async def test_reported_usage_over_reservation_latches_state_inconsistent(gateway_env: dict[str, str]) -> None:
    store = await real_redis_store(load_config())
    try:
        decision, reservation = await store.admit("client", 20)
        assert decision.allowed and reservation is not None
        assert await store.reconcile(reservation, 21) is ReconciliationOutcome.ACTUAL
        assert not await store.readiness_check()
        denied, _ = await store.admit("other-client", 20)
        assert denied.reason.value == "state_inconsistent"
    finally:
        await store.close()


@pytest.mark.long_running
@pytest.mark.redis
@pytest.mark.asyncio
async def test_active_state_has_no_unbounded_history_after_24_hours(gateway_env: dict[str, str]) -> None:
    if os.getenv("RUN_LONG_TESTS") != "1":
        pytest.skip("set RUN_LONG_TESTS=1 for the longevity gate")
    store = await real_redis_store(load_config())
    try:
        decision, reservation = await store.admit("bounded-client", 20)
        assert decision.allowed and reservation is not None
        await store.reconcile(reservation, 4)
        keys = [key async for key in store.redis.scan_iter(match=f"{store.keys.prefix}:*")]
        for key in keys:
            assert (await store.redis.ttl(key)) > 0 or key == store.keys.marker
            assert not any(term in key for term in ("history", "spend", "analytics", "prompt", "response"))
    finally:
        await store.close()
