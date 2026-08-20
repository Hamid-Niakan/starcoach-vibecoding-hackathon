from __future__ import annotations

import asyncio

import pytest

from ai_gateway.proxy.proxy_config import load_config
from tests.integration.redis_helpers import real_redis_store


@pytest.mark.redis
@pytest.mark.integration
@pytest.mark.asyncio
async def test_atomic_concurrent_admission_never_exceeds_client_concurrency(gateway_env: dict[str, str]) -> None:
    config = load_config().model_copy(update={"client_max_concurrency": 2})
    store = await real_redis_store(config)
    try:
        decisions = await asyncio.gather(*(store.admit("same-client", 20) for _ in range(20)))
        assert sum(decision.allowed for decision, _ in decisions) == 2
    finally:
        await store.close()


@pytest.mark.redis
@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("field", "reason", "same_client"),
    [
        ("client_rpm", "client_rpm", True),
        ("client_tpm", "client_tpm", True),
        ("client_max_concurrency", "client_concurrency", True),
        ("client_quota_tokens", "client_quota", True),
        ("global_rpm", "global_rpm", False),
        ("global_tpm", "global_tpm", False),
        ("global_max_concurrency", "global_concurrency", False),
        ("global_quota_tokens", "global_quota", False),
    ],
)
async def test_every_client_and_global_boundary_is_atomic(
    gateway_env: dict[str, str], field: str, reason: str, same_client: bool
) -> None:
    base = {
        "client_rpm": 100,
        "client_tpm": 10_000,
        "client_max_concurrency": 100,
        "client_quota_tokens": 10_000,
        "global_rpm": 100,
        "global_tpm": 10_000,
        "global_max_concurrency": 100,
        "global_quota_tokens": 10_000,
    }
    base[field] = 1 if field.endswith("rpm") or field.endswith("concurrency") else 30
    store = await real_redis_store(load_config().model_copy(update=base))
    try:
        first, _ = await store.admit("client-a", 20)
        second, _ = await store.admit("client-a" if same_client else "client-b", 20)
        assert first.allowed
        assert not second.allowed and second.reason.value == reason
    finally:
        await store.close()
