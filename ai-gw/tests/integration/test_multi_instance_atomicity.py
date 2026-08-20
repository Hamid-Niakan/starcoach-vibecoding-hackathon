from __future__ import annotations

import asyncio

import pytest
from redis.exceptions import ConnectionError, NoScriptError

from ai_gateway.proxy.enforcement._types import AdmissionReason
from ai_gateway.proxy.enforcement.redis_scripts import RedisScripts
from ai_gateway.proxy.enforcement.redis_store import RedisEnforcementStore
from ai_gateway.proxy.proxy_config import load_config
from tests.integration.redis_helpers import real_redis_store


@pytest.mark.redis
@pytest.mark.integration
@pytest.mark.asyncio
async def test_two_instances_share_one_atomic_limit(gateway_env: dict[str, str]) -> None:
    first = await real_redis_store(load_config().model_copy(update={"global_max_concurrency": 3}))
    second = RedisEnforcementStore(first.config)
    await second.scripts.load()
    try:
        decisions = await asyncio.gather(
            *(
                first.admit(f"client-{index}", 20) if index % 2 else second.admit(f"client-{index}", 20)
                for index in range(20)
            )
        )
        assert sum(decision.allowed for decision, _ in decisions) == 3
    finally:
        await first.close()
        await second.close()


@pytest.mark.asyncio
async def test_noscript_reloads_once() -> None:
    class FakeRedis:
        def __init__(self) -> None:
            self.loads = 0
            self.evals = 0

        async def script_load(self, _: str) -> str:
            self.loads += 1
            return f"sha-{self.loads}"

        async def evalsha(self, *_):
            self.evals += 1
            if self.evals == 1:
                raise NoScriptError("missing")
            return [1, "allowed", 0]

    fake = FakeRedis()
    scripts = RedisScripts(fake)
    assert await scripts.eval_admit(["marker"], []) == [1, "allowed", 0]
    assert fake.loads == 3 and fake.evals == 2


@pytest.mark.asyncio
async def test_ambiguous_redis_failure_has_no_local_fallback(gateway_env: dict[str, str]) -> None:
    store = RedisEnforcementStore(load_config())

    class FailingScripts:
        async def eval_admit(self, *_):
            raise ConnectionError("ambiguous")

    store.scripts = FailingScripts()
    decision, reservation = await store.admit("client", 20)
    assert decision.reason is AdmissionReason.STATE_UNAVAILABLE
    assert reservation is None
    await store.close()
