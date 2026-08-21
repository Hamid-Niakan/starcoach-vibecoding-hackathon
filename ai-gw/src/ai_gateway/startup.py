from __future__ import annotations

import json
from pathlib import Path

import httpx

from ai_gateway.grounding.index_client import IndexClient, IndexUnavailable
from ai_gateway.grounding.models import ApprovedDocumentationRevision, RevisionStatus
from ai_gateway.proxy.enforcement.bootstrap import bootstrap
from ai_gateway.proxy.proxy_config import ProxyConfig, load_config


async def validate_startup(config: ProxyConfig | None = None) -> None:
    settings = config or load_config()
    await bootstrap()
    if not settings.liara_grounding_enabled:
        return
    if (
        settings.meili_url is None
        or settings.meili_api_key is None
        or settings.liara_index_uid is None
        or settings.liara_corpus_revision is None
    ):
        raise RuntimeError("startup_dependency_invalid")
    manifest_path = settings.corpus_manifest_path
    if not manifest_path:
        raise RuntimeError("approved_manifest_required")
    try:
        manifest_text = Path(manifest_path).read_text(encoding="utf-8")  # noqa: ASYNC230, ASYNC240
        manifest = ApprovedDocumentationRevision.model_validate(json.loads(manifest_text))
    except (OSError, ValueError, TypeError) as exc:
        raise RuntimeError("approved_manifest_invalid") from exc
    if manifest.status is not RevisionStatus.ACTIVE:
        raise RuntimeError("approved_manifest_not_active")
    async with httpx.AsyncClient(trust_env=False) as http:
        client = IndexClient(
            http=http,
            base_url=str(settings.meili_url),
            api_key=settings.meili_api_key.get_secret_value(),
            index_uid=settings.liara_index_uid,
            revision=settings.liara_corpus_revision,
            timeout_seconds=settings.meili_timeout_seconds,
            candidate_limit=settings.retrieval_candidate_limit,
        )
        try:
            await client.validate_manifest(manifest)
            if not await client.readiness_check():
                raise IndexUnavailable("documentation index unavailable")
        except IndexUnavailable as exc:
            raise RuntimeError("approved_index_unavailable") from exc
