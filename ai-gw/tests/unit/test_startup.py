from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest

from ai_gateway import startup
from ai_gateway.proxy.proxy_config import load_config
from tests.contract.test_grounded_chat_contract import REVISION, enable_grounding


def manifest(status: str) -> dict[str, object]:
    return {
        "revision": REVISION,
        "upstream_revision": "dbb7430b",
        "schema_version": 1,
        "chunker_version": "section-v1",
        "embedder_revision_digest": "b" * 64,
        "aggregate_checksum": "c" * 64,
        "page_count": 1143,
        "chunk_count": 4962,
        "built_at": datetime(2026, 8, 21, tzinfo=UTC).isoformat(),
        "status": status,
        "index_uid": "liara_docs_aaaaaaaaaaaaaaaa",
        "route_inventory_checksum": "d" * 64,
        "policy_digest": "e" * 64,
    }


@pytest.mark.asyncio
async def test_startup_rejects_a_compatible_but_unapproved_manifest(
    gateway_env: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    enable_grounding(monkeypatch)
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest("building")), encoding="utf-8")
    monkeypatch.setenv("AI_GATEWAY_CORPUS_MANIFEST_PATH", str(path))

    async def boot() -> None:
        return None

    monkeypatch.setattr(startup, "bootstrap", boot)
    with pytest.raises(RuntimeError, match="approved_manifest_not_active"):
        await startup.validate_startup(load_config())


@pytest.mark.asyncio
async def test_startup_accepts_only_active_manifest_and_ready_matching_index(
    gateway_env: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    enable_grounding(monkeypatch)
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest("active")), encoding="utf-8")
    monkeypatch.setenv("AI_GATEWAY_CORPUS_MANIFEST_PATH", str(path))

    async def boot() -> None:
        return None

    class ReadyIndex:
        def __init__(self, **kwargs: object) -> None:
            pass

        async def validate_manifest(self, value: object) -> None:
            return None

        async def readiness_check(self) -> bool:
            return True

    monkeypatch.setattr(startup, "bootstrap", boot)
    monkeypatch.setattr(startup, "IndexClient", ReadyIndex)
    await startup.validate_startup(load_config())
