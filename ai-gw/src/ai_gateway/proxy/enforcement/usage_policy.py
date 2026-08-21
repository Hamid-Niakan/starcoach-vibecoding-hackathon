from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from ai_gateway.proxy.proxy_config import ProxyConfig


class UsageScope(StrEnum):
    CLIENT = "client"
    GLOBAL = "global"


@dataclass(frozen=True, slots=True)
class UsagePolicy:
    scope: UsageScope
    requests_per_minute: int
    tokens_per_minute: int
    max_concurrency: int
    quota_tokens: int
    quota_window_seconds: int

    @classmethod
    def client(cls, config: ProxyConfig) -> UsagePolicy:
        return cls(
            UsageScope.CLIENT,
            config.client_rpm,
            config.client_tpm,
            config.client_max_concurrency,
            config.client_quota_tokens,
            config.client_quota_window_seconds,
        )

    @classmethod
    def global_(cls, config: ProxyConfig) -> UsagePolicy:
        return cls(
            UsageScope.GLOBAL,
            config.global_rpm,
            config.global_tpm,
            config.global_max_concurrency,
            config.global_quota_tokens,
            config.global_quota_window_seconds,
        )
