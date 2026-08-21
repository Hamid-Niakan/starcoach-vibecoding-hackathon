from __future__ import annotations

from ai_gateway.proxy._types import ProxyChatCompletionRequest, Usage
from ai_gateway.proxy.proxy_config import ProxyConfig


def effective_max_output_tokens(request: ProxyChatCompletionRequest, config: ProxyConfig) -> int:
    requested = request.max_completion_tokens or request.max_tokens or config.max_output_tokens
    return min(requested, config.max_output_tokens)


def reserved_token_count(request: ProxyChatCompletionRequest, config: ProxyConfig) -> int:
    return config.model_max_input_tokens + (request.n or 1) * effective_max_output_tokens(request, config)


def extract_provider_usage(payload: object) -> Usage | None:
    if not isinstance(payload, dict) or not isinstance(payload.get("usage"), dict):
        return None
    try:
        return Usage.model_validate(payload["usage"])
    except ValueError:
        return None


def extract_trustworthy_usage(payload: object, maximum: int) -> Usage | None:
    usage = extract_provider_usage(payload)
    if usage is None:
        return None
    return usage if usage.total_tokens <= maximum else None
