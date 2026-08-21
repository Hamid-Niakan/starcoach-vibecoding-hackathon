from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_gateway.proxy._types import ProxyChatCompletionRequest, Usage


def test_chat_request_accepts_tools_multimodal_and_structured_output() -> None:
    request = ProxyChatCompletionRequest.model_validate(
        {
            "model": "test-chat",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "hi"},
                        {"type": "image_url", "image_url": "data:image/png;base64,YQ=="},
                    ],
                },
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [{"id": "1", "type": "function", "function": {"name": "clock", "arguments": "{}"}}],
                },
                {"role": "tool", "tool_call_id": "1", "content": "noon"},
            ],
            "tools": [{"type": "function", "function": {"name": "clock", "parameters": {"type": "object"}}}],
            "response_format": {"type": "json_object"},
        }
    )
    assert request.model == "test-chat"


@pytest.mark.parametrize("field", ["api_base", "api_key", "fallbacks", "router", "metadata"])
def test_chat_request_forbids_litellm_routing_fields(field: str) -> None:
    with pytest.raises(ValidationError):
        ProxyChatCompletionRequest.model_validate(
            {"model": "test-chat", "messages": [{"role": "user", "content": "hi"}], field: "bad"}
        )


def test_remote_media_and_conflicting_token_caps_are_rejected() -> None:
    with pytest.raises(ValidationError):
        ProxyChatCompletionRequest.model_validate(
            {
                "model": "test-chat",
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "image_url", "image_url": {"url": "https://example.test/x.png"}}],
                    }
                ],
            }
        )
    with pytest.raises(ValidationError):
        ProxyChatCompletionRequest.model_validate(
            {
                "model": "test-chat",
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": 2,
                "max_completion_tokens": 2,
            }
        )


def test_usage_uses_openai_names() -> None:
    usage = Usage(prompt_tokens=3, completion_tokens=4, total_tokens=7)
    assert usage.model_dump() == {"prompt_tokens": 3, "completion_tokens": 4, "total_tokens": 7}


def test_usage_allows_provider_specific_token_breakdowns() -> None:
    usage = Usage(
        prompt_tokens=3,
        completion_tokens=4,
        total_tokens=7,
        completion_tokens_details={"reasoning_tokens": 0},
    )
    assert usage.model_dump()["completion_tokens_details"] == {"reasoning_tokens": 0}
