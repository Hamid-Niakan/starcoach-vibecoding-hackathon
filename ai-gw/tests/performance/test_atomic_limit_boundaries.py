from __future__ import annotations

import asyncio
import os

import pytest

from ai_gateway.proxy.enforcement.redis_store import RedisEnforcementStore
from ai_gateway.proxy.proxy_config import load_config
from tests.integration.redis_helpers import real_redis_store


@pytest.mark.performance
@pytest.mark.redis
@pytest.mark.asyncio
async def test_10000_two_instance_decisions_have_zero_over_admission(gateway_env: dict[str, str]) -> None:
    if os.getenv("RUN_PERFORMANCE") != "1":
        pytest.skip("set RUN_PERFORMANCE=1 for the explicit performance gate")
    first = await real_redis_store(
        load_config().model_copy(
            update={
                "global_max_concurrency": 100,
                "global_rpm": 20_000,
                "global_tpm": 1_000_000,
                "global_quota_tokens": 10_000_000,
            }
        )
    )
    second = RedisEnforcementStore(first.config)
    await second.scripts.load()
    try:

        async def decision(index: int):
            store = first if index % 2 else second
            return await store.admit(f"client-{index}", 20)

        results = []
        for start in range(0, 10_000, 250):
            results.extend(await asyncio.gather(*(decision(index) for index in range(start, start + 250))))
        assert sum(item[0].allowed for item in results) == 100
    finally:
        await first.close()
        await second.close()
