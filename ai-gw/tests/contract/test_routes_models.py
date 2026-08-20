from __future__ import annotations

import httpx
import pytest

from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app


@pytest.mark.asyncio
async def test_model_list_is_static_and_contains_one_public_alias(gateway_env: dict[str, str]) -> None:
    app = create_app(load_config())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/v1/models")
    assert response.status_code == 200
    assert response.json() == {
        "object": "list",
        "data": [{"id": "test-chat", "object": "model", "created": 0, "owned_by": "ai-gateway"}],
    }
