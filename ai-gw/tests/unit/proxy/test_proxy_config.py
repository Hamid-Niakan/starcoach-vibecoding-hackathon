from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_gateway.proxy.proxy_config import ProxyConfig, load_config


def test_load_config_uses_litellm_terminology_and_is_frozen(gateway_env: dict[str, str]) -> None:
    config = load_config()
    assert config.model_name == "test-chat"
    assert config.litellm_params.model == "fixture-model"
    assert str(config.litellm_params.api_base) == "http://127.0.0.1:8080/v1"
    assert config.litellm_params.api_key.get_secret_value() == "fixture-secret-not-for-production"
    with pytest.raises(ValidationError):
        config.model_name = "changed"  # type: ignore[misc]


@pytest.mark.parametrize("value", ["", "change-me", "placeholder", '["a","b"]', "a,b"])
def test_model_name_rejects_empty_placeholder_plural_values(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("AI_GATEWAY_MODEL_NAME", value)
    with pytest.raises(ValidationError) as exc:
        load_config()
    assert "fixture-secret-not-for-production" not in str(exc.value)


def test_remote_plain_http_is_rejected(gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_GATEWAY_API_BASE", "http://provider.example/v1")
    monkeypatch.setenv("AI_GATEWAY_ALLOW_INSECURE_LOCAL_UPSTREAM", "false")
    with pytest.raises(ValidationError):
        load_config()


def test_unknown_routing_variable_is_rejected(gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_GATEWAY_FALLBACK_MODEL", "other")
    with pytest.raises(ValueError, match="unknown_ai_gateway_variable"):
        load_config()


def test_quota_window_must_exceed_stream_lifetime(gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_GATEWAY_CLIENT_QUOTA_WINDOW_SECONDS", "10")
    with pytest.raises(ValidationError):
        load_config()


def test_proxy_config_contains_one_scalar_destination(gateway_env: dict[str, str]) -> None:
    config = ProxyConfig()
    dumped = config.model_dump()
    assert "model_list" not in dumped
    assert set(dumped["litellm_params"]) == {"model", "api_base", "api_key"}


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("AI_GATEWAY_REDIS_URL", ""),
        ("AI_GATEWAY_IDENTITY_SECRET", "too-short"),
        ("AI_GATEWAY_CORS_ALLOW_ORIGINS", "*"),
        ("AI_GATEWAY_TRUSTED_PROXY_CIDRS", "not-a-network"),
    ],
)
def test_operator_critical_configuration_fails_closed(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch, name: str, value: str
) -> None:
    monkeypatch.setenv(name, value)
    with pytest.raises((ValidationError, ValueError)) as exc:
        load_config()
    rendered = str(exc.value)
    assert gateway_env["AI_GATEWAY_API_KEY"] not in rendered
    assert gateway_env["AI_GATEWAY_IDENTITY_SECRET"] not in rendered
