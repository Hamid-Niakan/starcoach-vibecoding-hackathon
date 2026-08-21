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


@pytest.mark.asyncio
async def test_openapi_advertises_optional_placeholder_authorization_and_request_ids(
    gateway_env: dict[str, str],
) -> None:
    app = create_app(load_config(), limiter=FakeLimiter())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        schema = (await client.get("/openapi.json")).json()

    parameter = schema["components"]["parameters"]["OptionalPlaceholderAuthorization"]
    assert parameter == {
        "in": "header",
        "name": "Authorization",
        "required": False,
        "description": "Optional non-secret compatibility placeholder; never used for authorization.",
        "schema": {"type": "string", "pattern": "^Bearer .+$"},
    }
    for path, method in (("/v1/models", "get"), ("/v1/chat/completions", "post")):
        operation = schema["paths"][path][method]
        assert {"$ref": "#/components/parameters/OptionalPlaceholderAuthorization"} in operation["parameters"]
        assert operation["responses"]["200"]["headers"]["x-request-id"] == {"$ref": "#/components/headers/RequestId"}
