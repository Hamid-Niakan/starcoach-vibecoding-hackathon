from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx
import pytest
import yaml
from openapi_spec_validator import validate

from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.support import FakeLimiter

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
PROFILE_PATH = REPOSITORY_ROOT / "specs/006-integrate-ai-gateway/contracts/openapi.yaml"
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head", "trace"}


def _resolve(document: dict[str, Any], value: dict[str, Any]) -> dict[str, Any]:
    current = value
    visited: set[str] = set()
    while "$ref" in current:
        reference = current["$ref"]
        assert isinstance(reference, str) and reference.startswith("#/"), reference
        assert reference not in visited, f"cyclic local reference: {reference}"
        visited.add(reference)
        target: Any = document
        for segment in reference.removeprefix("#/").split("/"):
            target = target[segment.replace("~1", "/").replace("~0", "~")]
        assert isinstance(target, dict), reference
        current = target
    return current


def _parameters(document: dict[str, Any], operation: dict[str, Any]) -> set[tuple[str, str]]:
    result: set[tuple[str, str]] = set()
    for raw_parameter in operation.get("parameters", []):
        parameter = _resolve(document, raw_parameter)
        result.add((parameter["in"].lower(), parameter["name"].lower()))
    return result


def _assert_operation_subset(
    profile: dict[str, Any],
    producer: dict[str, Any],
    path: str,
    method: str,
) -> None:
    expected = profile["paths"][path][method]
    actual = producer["paths"][path][method]
    assert expected["operationId"] == actual["operationId"]
    assert _parameters(profile, expected) <= _parameters(producer, actual)

    expected_body = expected.get("requestBody")
    if expected_body:
        actual_body = actual["requestBody"]
        for media_type, expected_media in expected_body["content"].items():
            actual_media = actual_body["content"][media_type]
            expected_schema = _resolve(profile, expected_media["schema"])
            actual_schema = _resolve(producer, actual_media["schema"])
            assert set(expected_schema.get("required", [])) >= set(actual_schema.get("required", []))
            assert set(expected_schema.get("properties", {})) <= set(actual_schema.get("properties", {}))

    for status, expected_response_value in expected["responses"].items():
        if status == "default":
            continue
        expected_response = _resolve(profile, expected_response_value)
        actual_response = _resolve(producer, actual["responses"][status])
        assert set(expected_response.get("content", {})) <= set(actual_response.get("content", {}))
        assert {
            header.lower() for header in expected_response.get("headers", {})
        } <= {header.lower() for header in actual_response.get("headers", {})}


@pytest.mark.asyncio
async def test_liara_consumer_profile_is_a_subset_of_live_openapi(gateway_env: dict[str, str]) -> None:
    profile = yaml.safe_load(PROFILE_PATH.read_text(encoding="utf-8"))
    assert profile["x-contract-role"] == "liara-consumer-profile"
    validate(profile)

    app = create_app(load_config(), limiter=FakeLimiter())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        producer = (await client.get("/openapi.json")).json()
    validate(producer)

    for path, path_item in profile["paths"].items():
        assert path in producer["paths"]
        for method in HTTP_METHODS & set(path_item):
            assert method in producer["paths"][path]
            _assert_operation_subset(profile, producer, path, method)
