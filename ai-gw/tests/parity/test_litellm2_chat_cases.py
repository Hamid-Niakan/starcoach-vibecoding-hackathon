from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_gateway.proxy._types import ProxyChatCompletionRequest


@pytest.mark.parametrize("role", ["system", "developer", "user"])
def test_retained_text_message_roles(role: str) -> None:
    value = ProxyChatCompletionRequest.model_validate(
        {"model": "public", "messages": [{"role": role, "content": "hello"}]}
    )
    assert value.messages[0].role == role


def test_unknown_proxy_fields_remain_excluded() -> None:
    with pytest.raises(ValidationError):
        ProxyChatCompletionRequest.model_validate(
            {"model": "public", "messages": [{"role": "user", "content": "hello"}], "num_retries": 3}
        )
