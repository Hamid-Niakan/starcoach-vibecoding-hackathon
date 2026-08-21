from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_gateway.proxy.proxy_config import load_config

GROUNDING_ENV = {
    "AI_GATEWAY_LIARA_GROUNDING_ENABLED": "true",
    "AI_GATEWAY_MEILI_URL": "http://127.0.0.1:7700",
    "AI_GATEWAY_MEILI_API_KEY": "fixture-meili-private-key",
    "AI_GATEWAY_LIARA_INDEX_UID": "liara_docs_active",
    "AI_GATEWAY_LIARA_CORPUS_REVISION": "a" * 64,
    "AI_GATEWAY_RETRIEVAL_POLICY_VERSION": "retrieval-v1",
    "AI_GATEWAY_PROMPT_VERSION": "prompt-v1",
    "AI_GATEWAY_CACHE_HMAC_SECRET": "abcdef0123456789abcdef0123456789",
    "AI_GATEWAY_ALLOW_INSECURE_LOCAL_MEILI": "true",
    "AI_GATEWAY_METRICS_TOKEN": "fixture-dedicated-metrics-token",
    "AI_GATEWAY_INPUT_COST_MICRO_PER_MILLION": "1000000",
    "AI_GATEWAY_OUTPUT_COST_MICRO_PER_MILLION": "2000000",
    "AI_GATEWAY_DAILY_COST_BUDGET_MICRO": "100000000",
}


def _enable_grounding(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in GROUNDING_ENV.items():
        monkeypatch.setenv(name, value)


def test_grounding_configuration_is_immutable_and_secret_values_are_protected(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable_grounding(monkeypatch)
    config = load_config()
    assert config.liara_grounding_enabled is True
    assert str(config.meili_url) == "http://127.0.0.1:7700/"
    assert config.liara_corpus_revision == "a" * 64
    dumped = str(config)
    assert GROUNDING_ENV["AI_GATEWAY_MEILI_API_KEY"] not in dumped
    assert GROUNDING_ENV["AI_GATEWAY_CACHE_HMAC_SECRET"] not in dumped
    assert GROUNDING_ENV["AI_GATEWAY_METRICS_TOKEN"] not in dumped


def test_explicit_local_override_accepts_compose_service_hostname(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable_grounding(monkeypatch)
    monkeypatch.setenv("AI_GATEWAY_MEILI_URL", "http://meilisearch:7700")

    config = load_config()

    assert str(config.meili_url) == "http://meilisearch:7700/"


def test_compose_service_hostname_requires_explicit_local_override(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable_grounding(monkeypatch)
    monkeypatch.setenv("AI_GATEWAY_MEILI_URL", "http://meilisearch:7700")
    monkeypatch.setenv("AI_GATEWAY_ALLOW_INSECURE_LOCAL_MEILI", "false")

    with pytest.raises(ValidationError, match="secure_meili_required"):
        load_config()


@pytest.mark.parametrize(
    "missing",
    [
        "AI_GATEWAY_MEILI_URL",
        "AI_GATEWAY_MEILI_API_KEY",
        "AI_GATEWAY_LIARA_INDEX_UID",
        "AI_GATEWAY_LIARA_CORPUS_REVISION",
        "AI_GATEWAY_RETRIEVAL_POLICY_VERSION",
        "AI_GATEWAY_PROMPT_VERSION",
        "AI_GATEWAY_CACHE_HMAC_SECRET",
    ],
)
def test_enabled_grounding_fails_closed_when_required_configuration_is_missing(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch, missing: str
) -> None:
    _enable_grounding(monkeypatch)
    monkeypatch.delenv(missing)
    with pytest.raises(ValidationError, match="grounding_configuration_required"):
        load_config()


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("AI_GATEWAY_LIARA_CORPUS_REVISION", "moving-main"),
        ("AI_GATEWAY_CACHE_HMAC_SECRET", "too-short"),
        ("AI_GATEWAY_METRICS_TOKEN", "replace-with-token"),
        ("AI_GATEWAY_MEILI_URL", "http://meili.example.com:7700"),
    ],
)
def test_grounding_rejects_unsafe_or_placeholder_values(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch, name: str, value: str
) -> None:
    _enable_grounding(monkeypatch)
    monkeypatch.setenv(name, value)
    with pytest.raises(ValidationError):
        load_config()


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("AI_GATEWAY_DIRECT_CONTEXT_TOKENS", "9000"),
        ("AI_GATEWAY_DIRECT_OUTPUT_TOKENS", "0"),
        ("AI_GATEWAY_COMPLEX_CONTEXT_TOKENS", "2000"),
        ("AI_GATEWAY_COMPLEX_OUTPUT_TOKENS", "5000"),
        ("AI_GATEWAY_DAILY_COST_BUDGET_MICRO", "0"),
    ],
)
def test_route_budgets_must_fit_model_and_gateway_limits(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch, name: str, value: str
) -> None:
    _enable_grounding(monkeypatch)
    monkeypatch.setenv(name, value)
    with pytest.raises(ValidationError):
        load_config()
