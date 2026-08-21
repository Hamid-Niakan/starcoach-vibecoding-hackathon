from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import yaml
from openapi_spec_validator import validate

from ai_gateway.grounding.index_client import IndexCandidate, IndexSearchResult
from ai_gateway.grounding.models import SourcePassage
from ai_gateway.grounding.orchestrator import GroundingOrchestrator
from ai_gateway.proxy.providers.openai_compatible import OpenAICompatible
from ai_gateway.proxy.proxy_config import load_config
from ai_gateway.proxy.proxy_server import create_app
from tests.support import ChunkStream, FakeLimiter

REVISION = "a" * 64
LIARA_PROFILE = yaml.safe_load(
    (Path(__file__).resolve().parents[3] / "specs/007-liara-assistant-quality/contracts/openapi.yaml").read_text(
        encoding="utf-8"
    )
)


class FakeIndex:
    async def search(self, query: str, *, service_filter: str | None = None) -> IndexSearchResult:
        assert query
        return IndexSearchResult(
            candidates=(IndexCandidate(passage=source(), score=0.95, lexical_rank=1, semantic_rank=1),),
            candidate_count=1,
        )


def source() -> SourcePassage:
    return SourcePassage(
        id="official-passage-01",
        revision=REVISION,
        source_path="paas/deploy.md",
        canonical_url="https://docs.liara.ir/paas/deploy/",
        verified_anchor="deploy",
        title="Deploy",
        heading_path=("Deploy",),
        service_tags=("paas",),
        language="mixed",
        content="Use liara deploy to deploy an application.",
        normalized_content="use liara deploy to deploy an application.",
        code_languages=("bash",),
        token_estimate=20,
        content_hash="b" * 64,
    )


def enable_grounding(monkeypatch: pytest.MonkeyPatch) -> None:
    values = {
        "AI_GATEWAY_LIARA_GROUNDING_ENABLED": "true",
        "AI_GATEWAY_MEILI_URL": "http://127.0.0.1:7700",
        "AI_GATEWAY_MEILI_API_KEY": "fixture-meili-private-key",
        "AI_GATEWAY_LIARA_INDEX_UID": "liara_docs_active",
        "AI_GATEWAY_LIARA_CORPUS_REVISION": REVISION,
        "AI_GATEWAY_RETRIEVAL_POLICY_VERSION": "retrieval-v1",
        "AI_GATEWAY_PROMPT_VERSION": "prompt-v1",
        "AI_GATEWAY_CACHE_HMAC_SECRET": "abcdef0123456789abcdef0123456789",
        "AI_GATEWAY_ALLOW_INSECURE_LOCAL_MEILI": "true",
        "AI_GATEWAY_METRICS_TOKEN": "fixture-dedicated-metrics-token",
        "AI_GATEWAY_INPUT_COST_MICRO_PER_MILLION": "1000000",
        "AI_GATEWAY_OUTPUT_COST_MICRO_PER_MILLION": "2000000",
        "AI_GATEWAY_DAILY_COST_BUDGET_MICRO": "100000000",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)


@pytest.mark.asyncio
async def test_grounded_non_stream_completion_has_server_owned_metadata(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    enable_grounding(monkeypatch)

    async def upstream(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert [message["role"] for message in payload["messages"]] == ["system", "user"]
        assert "tools" not in payload
        return httpx.Response(
            200,
            json={
                "id": "chatcmpl-grounded",
                "object": "chat.completion",
                "created": 1,
                "model": "fixture-model",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "Use liara deploy [[S1]]."},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
            },
            request=request,
        )

    config = load_config()
    app = create_app(
        config,
        provider=OpenAICompatible(config, httpx.MockTransport(upstream)),
        limiter=FakeLimiter(),
        grounding_orchestrator=GroundingOrchestrator(config, FakeIndex()),
    )
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        response = await client.post(
            "/v1/chat/completions",
            json={
                "model": "test-chat",
                "messages": [{"role": "user", "content": "How do I deploy on Liara?"}],
                "tools": [{"type": "function", "function": {"name": "deploy"}}],
            },
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["model"] == "test-chat"
    assert "docs.liara.ir/paas/deploy/#deploy" in payload["choices"][0]["message"]["content"]
    assert payload["x_liara"]["documentation_revision"] == REVISION
    assert payload["x_liara"]["citations"][0]["passage_id"] == "official-passage-01"
    assert "fixture-model" not in response.text


@pytest.mark.asyncio
async def test_grounded_stream_has_one_terminal_metadata_chunk_then_one_done(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    enable_grounding(monkeypatch)

    async def upstream(request: httpx.Request) -> httpx.Response:
        chunks = (
            b'data: {"id":"chatcmpl-grounded","object":"chat.completion.chunk","created":1,'
            b'"model":"fixture-model","choices":[{"index":0,"delta":{"content":"Use [[S"},'
            b'"finish_reason":null}]}\n\n',
            b'data: {"id":"chatcmpl-grounded","object":"chat.completion.chunk","created":1,'
            b'"model":"fixture-model","choices":[{"index":0,"delta":{"content":"1]]."},'
            b'"finish_reason":"stop"}]}\n\n',
            b'data: {"id":"chatcmpl-grounded","object":"chat.completion.chunk","created":1,'
            b'"model":"fixture-model","choices":[],"usage":{"prompt_tokens":10,'
            b'"completion_tokens":5,"total_tokens":15}}\n\n',
            b"data: [DONE]\n\n",
        )
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            stream=ChunkStream(chunks),
            request=request,
        )

    config = load_config()
    app = create_app(
        config,
        provider=OpenAICompatible(config, httpx.MockTransport(upstream)),
        limiter=FakeLimiter(),
        grounding_orchestrator=GroundingOrchestrator(config, FakeIndex()),
    )
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        response = await client.post(
            "/v1/chat/completions",
            json={
                "model": "test-chat",
                "messages": [{"role": "user", "content": "How do I deploy on Liara?"}],
                "stream": True,
            },
        )
    events = [line.removeprefix("data: ") for line in response.text.splitlines() if line.startswith("data: ")]
    terminal = [json.loads(event) for event in events[:-1] if "x_liara" in event]
    assert len(terminal) == 1
    assert terminal[0]["choices"] == []
    assert terminal[0]["x_liara"]["citations"][0]["passage_id"] == "official-passage-01"
    assert events[-1] == "[DONE]"
    assert response.text.count("data: [DONE]") == 1


@pytest.mark.asyncio
async def test_live_openapi_advertises_additive_grounding_metadata(
    gateway_env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    enable_grounding(monkeypatch)
    config = load_config()
    app = create_app(
        config,
        limiter=FakeLimiter(),
        grounding_orchestrator=GroundingOrchestrator(config, FakeIndex()),
        grounding_readiness_check=lambda: _ready(),
    )
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as client:
        schema = (await client.get("/openapi.json")).json()
    chat = schema["paths"]["/v1/chat/completions"]["post"]
    assert chat["operationId"] == "createGroundedChatCompletion"
    metadata = schema["components"]["schemas"]["LiaraAssistantMetadataV1"]
    assert metadata["additionalProperties"] is False
    assert "documentation_revision" in metadata["required"]
    terminal = schema["components"]["schemas"]["LiaraTerminalChunk"]
    assert "x_liara" in terminal["required"]
    stream = chat["responses"]["200"]["content"]["text/event-stream"]["schema"]
    assert stream["x-data-event-schema"]["oneOf"][-1]["$ref"].endswith("LiaraTerminalChunk")
    validate(LIARA_PROFILE)
    expected = LIARA_PROFILE["components"]["schemas"]["LiaraAssistantMetadataV1"]
    assert set(metadata["required"]) == set(expected["required"])
    assert set(metadata["properties"]) == set(expected["properties"])


async def _ready() -> bool:
    return True
