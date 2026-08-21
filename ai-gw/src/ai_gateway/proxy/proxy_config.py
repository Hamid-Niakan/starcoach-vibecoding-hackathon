from __future__ import annotations

import ipaddress
import os
import re
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, SecretStr, field_validator, model_validator


def _visible_scalar(value: str) -> str:
    cleaned = value.strip()
    lowered = cleaned.lower()
    if (
        not cleaned
        or lowered in {"change-me", "changeme", "placeholder", "none", "null"}
        or lowered.startswith("replace-with")
    ):
        raise ValueError("value_must_be_configured")
    if "," in cleaned or cleaned.startswith("[") or cleaned.startswith("{"):
        raise ValueError("scalar_value_required")
    return cleaned


class LiteLLMParams(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    model: str = Field(min_length=1, max_length=256)
    api_base: HttpUrl
    api_key: SecretStr

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        return _visible_scalar(value)

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, value: SecretStr) -> SecretStr:
        secret = value.get_secret_value().strip()
        if (
            len(secret) < 12
            or secret.lower() in {"change-me", "placeholder"}
            or secret.lower().startswith("replace-with")
        ):
            raise ValueError("api_key_must_be_configured")
        return SecretStr(secret)


class ProxyConfig(BaseModel):
    """Immutable startup configuration for exactly one LiteLLM-style destination."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    model_name: str = Field(min_length=1, max_length=128)
    litellm_params: LiteLLMParams
    redis_url: SecretStr
    deployment_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
    enforcement_epoch: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
    identity_secret: SecretStr
    model_max_input_tokens: int = Field(gt=0)

    liara_grounding_enabled: bool = False
    meili_url: HttpUrl | None = None
    meili_api_key: SecretStr | None = None
    liara_index_uid: str | None = Field(default=None, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
    liara_corpus_revision: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    corpus_manifest_path: str | None = Field(default=None, min_length=1, max_length=1024)
    retrieval_policy_version: str | None = Field(default=None, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
    prompt_version: str | None = Field(default=None, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
    cache_hmac_secret: SecretStr | None = None
    metrics_token: SecretStr | None = None
    allow_unauthenticated_metrics: bool = False
    allow_insecure_local_meili: bool = False

    direct_context_tokens: int = Field(default=2_500, gt=0)
    direct_output_tokens: int = Field(default=600, gt=0)
    complex_context_tokens: int = Field(default=6_000, gt=0)
    complex_output_tokens: int = Field(default=1_200, gt=0)
    clarify_output_tokens: int = Field(default=200, gt=0)
    input_cost_micro_per_million: int = Field(default=0, ge=0)
    output_cost_micro_per_million: int = Field(default=0, ge=0)
    daily_cost_budget_micro: int = Field(default=1, gt=0)
    meili_timeout_seconds: float = Field(default=3.0, gt=0)
    retrieval_candidate_limit: int = Field(default=20, gt=0, le=100)
    direct_passage_limit: int = Field(default=4, gt=0, le=12)
    complex_passage_limit: int = Field(default=8, gt=0, le=12)

    client_rpm: int = Field(default=60, gt=0)
    client_tpm: int = Field(default=100_000, gt=0)
    client_max_concurrency: int = Field(default=4, gt=0)
    client_quota_tokens: int = Field(default=1_000_000, gt=0)
    client_quota_window_seconds: int = Field(default=86_400, gt=0)
    global_rpm: int = Field(default=1_000, gt=0)
    global_tpm: int = Field(default=2_000_000, gt=0)
    global_max_concurrency: int = Field(default=100, gt=0)
    global_quota_tokens: int = Field(default=50_000_000, gt=0)
    global_quota_window_seconds: int = Field(default=86_400, gt=0)

    max_body_bytes: int = Field(default=1_048_576, gt=0)
    max_header_bytes: int = Field(default=32_768, gt=0)
    max_header_count: int = Field(default=128, gt=0)
    max_forwarded_hops: int = Field(default=16, gt=0)
    max_json_depth: int = Field(default=32, gt=0)
    max_messages: int = Field(default=128, gt=0, le=128)
    max_tools: int = Field(default=32, gt=0, le=32)
    max_output_tokens: int = Field(default=4096, gt=0)
    max_request_seconds: int = Field(default=120, gt=0)
    max_stream_seconds: int = Field(default=300, gt=0)
    reconciliation_grace_seconds: int = Field(default=60, ge=0)
    max_response_bytes: int = Field(default=8_388_608, gt=0)
    max_upstream_header_bytes: int = Field(default=32_768, gt=0)
    max_sse_event_bytes: int = Field(default=262_144, gt=0)
    max_sse_buffer_bytes: int = Field(default=524_288, gt=0)
    max_stream_bytes: int = Field(default=67_108_864, gt=0)
    max_stream_events: int = Field(default=100_000, gt=0)

    connect_timeout_seconds: float = Field(default=5.0, gt=0)
    read_timeout_seconds: float = Field(default=120.0, gt=0)
    write_timeout_seconds: float = Field(default=10.0, gt=0)
    pool_timeout_seconds: float = Field(default=5.0, gt=0)
    max_connections: int = Field(default=100, gt=0)
    max_keepalive_connections: int = Field(default=20, ge=0)
    redis_timeout_seconds: float = Field(default=2.0, gt=0)

    trusted_proxy_cidrs: tuple[str, ...] = ()
    cors_allow_origins: tuple[str, ...] = ()
    allow_insecure_local_upstream: bool = False
    allow_private_upstream: bool = False
    log_level: str = "INFO"
    log_queue_capacity: int = Field(default=4096, gt=0)

    def __init__(self, **data: Any) -> None:
        if not data:
            data = _read_environment(reject_unknown=False)
        super().__init__(**data)

    @field_validator("model_name", "deployment_id", "enforcement_epoch")
    @classmethod
    def validate_scalar(cls, value: str) -> str:
        return _visible_scalar(value)

    @field_validator("identity_secret")
    @classmethod
    def validate_identity_secret(cls, value: SecretStr) -> SecretStr:
        secret = value.get_secret_value()
        if len(secret) < 32 or secret.lower().startswith("replace-with"):
            raise ValueError("identity_secret_too_short")
        return value

    @field_validator("meili_api_key", "cache_hmac_secret", "metrics_token")
    @classmethod
    def validate_grounding_secrets(cls, value: SecretStr | None) -> SecretStr | None:
        if value is None:
            return None
        secret = value.get_secret_value().strip()
        if len(secret) < 16 or secret.lower().startswith("replace-with"):
            raise ValueError("protected_value_must_be_configured")
        return SecretStr(secret)

    @field_validator("trusted_proxy_cidrs", "cors_allow_origins", mode="before")
    @classmethod
    def parse_csv(cls, value: Any) -> Any:
        if isinstance(value, str):
            return tuple(part.strip() for part in value.split(",") if part.strip())
        return value

    @field_validator("trusted_proxy_cidrs")
    @classmethod
    def validate_proxy_cidrs(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        return tuple(str(ipaddress.ip_network(item, strict=False)) for item in value)

    @field_validator("cors_allow_origins")
    @classmethod
    def validate_cors_origins(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        normalized: list[str] = []
        for item in value:
            if item == "*":
                raise ValueError("wildcard_cors_not_allowed")
            parsed = urlsplit(item)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.path not in {"", "/"}:
                raise ValueError("invalid_cors_origin")
            if parsed.query or parsed.fragment or parsed.username or parsed.password:
                raise ValueError("invalid_cors_origin")
            normalized.append(urlunsplit((parsed.scheme, parsed.netloc, "", "", "")))
        return tuple(normalized)

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, value: str) -> str:
        normalized = value.upper()
        if normalized not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("invalid_log_level")
        return normalized

    @model_validator(mode="after")
    def validate_policy(self) -> ProxyConfig:
        parsed = urlsplit(str(self.litellm_params.api_base))
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("invalid_api_base")
        host = parsed.hostname or ""
        is_local = host.lower() == "localhost"
        try:
            address = ipaddress.ip_address(host)
            if address.is_link_local or address.is_multicast or address.is_unspecified:
                raise ValueError("unsafe_upstream_address")
            is_local = is_local or address.is_loopback or address.is_private
        except ValueError:
            pass
        if parsed.scheme == "http" and not (self.allow_insecure_local_upstream and self.allow_private_upstream):
            raise ValueError("https_required")
        if is_local and not self.allow_private_upstream:
            raise ValueError("private_upstream_not_allowed")
        redis = urlsplit(self.redis_url.get_secret_value())
        if redis.scheme not in {"redis", "rediss"} or not redis.hostname or redis.fragment:
            raise ValueError("invalid_redis_url")
        required_window = self.max_stream_seconds + self.reconciliation_grace_seconds
        if self.client_quota_window_seconds <= required_window or self.global_quota_window_seconds <= required_window:
            raise ValueError("quota_window_must_exceed_stream_lifetime")
        if self.max_keepalive_connections > self.max_connections:
            raise ValueError("keepalive_exceeds_connection_limit")
        maximum_reservation = self.model_max_input_tokens + 8 * self.max_output_tokens
        if maximum_reservation > min(
            self.client_tpm,
            self.client_quota_tokens,
            self.global_tpm,
            self.global_quota_tokens,
        ):
            raise ValueError("reservation_exceeds_enforcement_policy")

        if self.liara_grounding_enabled:
            required_grounding = (
                self.meili_url,
                self.meili_api_key,
                self.liara_index_uid,
                self.liara_corpus_revision,
                self.retrieval_policy_version,
                self.prompt_version,
                self.cache_hmac_secret,
            )
            if any(value is None for value in required_grounding):
                raise ValueError("grounding_configuration_required")
            assert self.meili_url is not None
            meili = urlsplit(str(self.meili_url))
            if meili.username or meili.password or meili.query or meili.fragment:
                raise ValueError("invalid_meili_url")
            meili_host = meili.hostname or ""
            # Docker Compose resolves services through single-label DNS names such as
            # `meilisearch`. Treat those names as local only behind the explicit
            # development override; dotted/public hostnames still require HTTPS.
            local_meili = meili_host.lower() == "localhost" or bool(
                re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", meili_host.lower())
            )
            try:
                meili_address = ipaddress.ip_address(meili_host)
                if meili_address.is_link_local or meili_address.is_multicast or meili_address.is_unspecified:
                    raise ValueError("unsafe_meili_address")
                local_meili = local_meili or meili_address.is_loopback or meili_address.is_private
            except ValueError as exc:
                if str(exc) == "unsafe_meili_address":
                    raise
            if meili.scheme != "https" and not (local_meili and self.allow_insecure_local_meili):
                raise ValueError("secure_meili_required")
            if self.input_cost_micro_per_million <= 0 or self.output_cost_micro_per_million <= 0:
                raise ValueError("cost_coefficients_required")

        if self.direct_context_tokens > self.model_max_input_tokens:
            raise ValueError("direct_context_exceeds_model")
        if self.complex_context_tokens > self.model_max_input_tokens:
            raise ValueError("complex_context_exceeds_model")
        if self.direct_context_tokens > self.complex_context_tokens:
            raise ValueError("direct_context_exceeds_complex")
        if self.direct_output_tokens > self.complex_output_tokens:
            raise ValueError("direct_output_exceeds_complex")
        route_output_limit = max(
            self.direct_output_tokens,
            self.complex_output_tokens,
            self.clarify_output_tokens,
        )
        if route_output_limit > self.max_output_tokens:
            raise ValueError("route_output_exceeds_gateway")
        if self.direct_passage_limit > self.complex_passage_limit:
            raise ValueError("direct_passages_exceed_complex")
        return self


_ENV_FIELDS: dict[str, tuple[str, Any]] = {
    "MODEL_NAME": ("model_name", str),
    "REDIS_URL": ("redis_url", SecretStr),
    "DEPLOYMENT_ID": ("deployment_id", str),
    "ENFORCEMENT_EPOCH": ("enforcement_epoch", str),
    "IDENTITY_SECRET": ("identity_secret", SecretStr),
    "MODEL_MAX_INPUT_TOKENS": ("model_max_input_tokens", int),
}

for _field, _info in ProxyConfig.model_fields.items():
    if _field in {
        "model_name",
        "litellm_params",
        "redis_url",
        "deployment_id",
        "enforcement_epoch",
        "identity_secret",
        "model_max_input_tokens",
    }:
        continue
    _ENV_FIELDS[_field.upper()] = (_field, _info.annotation)

_DESTINATION_ENV = {"MODEL", "API_BASE", "API_KEY"}


def _convert(value: str, annotation: Any) -> Any:
    if annotation is bool:
        lowered = value.strip().lower()
        if lowered not in {"true", "false", "1", "0", "yes", "no"}:
            raise ValueError("invalid_boolean")
        return lowered in {"true", "1", "yes"}
    if annotation is int:
        return int(value)
    if annotation is float:
        return float(value)
    return value


def _read_environment(*, reject_unknown: bool) -> dict[str, Any]:
    prefix = "AI_GATEWAY_"
    known = set(_ENV_FIELDS) | _DESTINATION_ENV
    unknown = sorted(key for key in os.environ if key.startswith(prefix) and key[len(prefix) :] not in known)
    if reject_unknown and unknown:
        raise ValueError("unknown_ai_gateway_variable:" + ",".join(unknown))

    data: dict[str, Any] = {}
    for suffix, (field, annotation) in _ENV_FIELDS.items():
        if (raw := os.getenv(prefix + suffix)) is not None:
            data[field] = _convert(raw, annotation)
    data["litellm_params"] = {
        "model": os.getenv(prefix + "MODEL", ""),
        "api_base": _normalize_api_base(os.getenv(prefix + "API_BASE", "")),
        "api_key": os.getenv(prefix + "API_KEY", ""),
    }
    return data


def _normalize_api_base(value: str) -> str:
    parsed = urlsplit(value.strip())
    path = parsed.path.rstrip("/")
    return urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, parsed.fragment))


def load_config() -> ProxyConfig:
    return ProxyConfig(**_read_environment(reject_unknown=True))
