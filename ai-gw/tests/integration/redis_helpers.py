from __future__ import annotations

import os
import uuid

import pytest
from pydantic import SecretStr

from ai_gateway.proxy.enforcement.redis_store import RedisEnforcementStore
from ai_gateway.proxy.proxy_config import ProxyConfig


async def real_redis_store(config: ProxyConfig) -> RedisEnforcementStore:
    url = os.getenv("TEST_REDIS_URL")
    if not url:
        pytest.skip("set TEST_REDIS_URL to run real-Redis integration tests")
    isolated = config.model_copy(
        update={
            "redis_url": SecretStr(url),
            "deployment_id": f"pytest-{uuid.uuid4().hex}",
            "enforcement_epoch": "test-v1",
            "model_max_input_tokens": 10,
            "max_output_tokens": 10,
        }
    )
    store = RedisEnforcementStore(isolated)
    await store.scripts.load()
    await store.redis.set(store.keys.marker, store.marker)
    return store
