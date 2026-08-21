from __future__ import annotations

import httpx
import pytest

from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app


@pytest.mark.asyncio
async def test_invalid_model_fails_before_dispatch(gateway_env: dict[str, str]) -> None:
    app = create_app(load_config())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/v1/chat/completions", json={"model": "attacker-value", "messages": [{"role": "user", "content": "hi"}]}
        )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_model"
    assert "attacker-value" not in response.text
