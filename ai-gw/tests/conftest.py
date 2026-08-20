from __future__ import annotations

from collections.abc import Iterator

import pytest

BASE_ENV = {
    "AI_GATEWAY_MODEL_NAME": "test-chat",
    "AI_GATEWAY_MODEL": "fixture-model",
    "AI_GATEWAY_API_BASE": "http://127.0.0.1:8080/v1",
    "AI_GATEWAY_API_KEY": "fixture-secret-not-for-production",
    "AI_GATEWAY_REDIS_URL": "redis://127.0.0.1:6379/15",
    "AI_GATEWAY_DEPLOYMENT_ID": "test-deployment",
    "AI_GATEWAY_ENFORCEMENT_EPOCH": "test-v1",
    "AI_GATEWAY_IDENTITY_SECRET": "0123456789abcdef0123456789abcdef",
    "AI_GATEWAY_MODEL_MAX_INPUT_TOKENS": "8192",
    "AI_GATEWAY_ALLOW_INSECURE_LOCAL_UPSTREAM": "true",
    "AI_GATEWAY_ALLOW_PRIVATE_UPSTREAM": "true",
}


@pytest.fixture
def gateway_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, str]]:
    for key in tuple(BASE_ENV):
        monkeypatch.delenv(key, raising=False)
    for key, value in BASE_ENV.items():
        monkeypatch.setenv(key, value)
    yield dict(BASE_ENV)
