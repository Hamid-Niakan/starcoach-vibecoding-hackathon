from __future__ import annotations

import httpx
import pytest
from openapi_spec_validator import validate

from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.support import FakeLimiter


@pytest.mark.asyncio
async def test_openapi_has_only_four_operations_and_stream_contract(gateway_env: dict[str, str]) -> None:
    app = create_app(load_config(), limiter=FakeLimiter())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        schema = (await client.get("/openapi.json")).json()
    validate(schema)
    operations = {(path, method) for path, item in schema["paths"].items() for method in item}
    assert operations == {
        ("/v1/chat/completions", "post"),
        ("/v1/models", "get"),
        ("/health/liveness", "get"),
        ("/health/readiness", "get"),
    }
    assert "text/event-stream" in schema["paths"]["/v1/chat/completions"]["post"]["responses"]["200"]["content"]
