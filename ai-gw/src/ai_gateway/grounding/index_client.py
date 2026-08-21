from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import ValidationError

from ai_gateway.grounding.models import ApprovedDocumentationRevision, SourcePassage


class IndexUnavailable(RuntimeError):
    """Sanitized documentation-index failure safe for orchestration."""


@dataclass(frozen=True, slots=True)
class IndexCandidate:
    passage: SourcePassage
    score: float
    lexical_rank: int | None = None
    semantic_rank: int | None = None


@dataclass(frozen=True, slots=True)
class IndexSearchResult:
    candidates: tuple[IndexCandidate, ...]
    candidate_count: int


_CAMEL_TO_SNAKE = {
    "sourcePath": "source_path",
    "canonicalUrl": "canonical_url",
    "verifiedAnchor": "verified_anchor",
    "headingPath": "heading_path",
    "serviceTags": "service_tags",
    "normalizedContent": "normalized_content",
    "codeLanguages": "code_languages",
    "tokenEstimate": "token_estimate",
    "contentHash": "content_hash",
}


class IndexClient:
    def __init__(
        self,
        *,
        http: httpx.AsyncClient,
        base_url: str,
        api_key: str,
        index_uid: str,
        revision: str,
        timeout_seconds: float,
        candidate_limit: int,
    ) -> None:
        if not api_key or not index_uid or candidate_limit < 1 or candidate_limit > 100:
            raise ValueError("invalid index client configuration")
        self._http = http
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._index_uid = index_uid
        self._revision = revision
        self._timeout = timeout_seconds
        self._candidate_limit = candidate_limit

    async def health(self) -> bool:
        try:
            response = await self._http.get(f"{self._base_url}/health", timeout=self._timeout)
            response.raise_for_status()
            payload = response.json()
            return isinstance(payload, dict) and payload.get("status") == "available"
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise IndexUnavailable("documentation index unavailable") from exc

    async def validate_manifest(self, manifest: ApprovedDocumentationRevision) -> None:
        if manifest.revision != self._revision:
            raise IndexUnavailable("documentation index revision unavailable")
        try:
            response = await self._http.get(
                f"{self._base_url}/indexes/{self._index_uid}/stats",
                headers={"authorization": f"Bearer {self._api_key}"},
                timeout=self._timeout,
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or payload.get("numberOfDocuments") != manifest.chunk_count:
                raise ValueError("manifest count mismatch")
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise IndexUnavailable("documentation index revision unavailable") from exc

    async def readiness_check(self) -> bool:
        try:
            if not await self.health():
                return False
            response = await self._http.post(
                f"{self._base_url}/indexes/{self._index_uid}/search",
                headers={"authorization": f"Bearer {self._api_key}"},
                json={
                    "q": "",
                    "limit": 1,
                    "filter": [f'revision = "{self._revision}"'],
                    "attributesToRetrieve": ["id", "revision"],
                },
                timeout=self._timeout,
            )
            response.raise_for_status()
            payload = response.json()
            hits = payload.get("hits") if isinstance(payload, dict) else None
            return bool(
                isinstance(hits, list)
                and len(hits) == 1
                and isinstance(hits[0], dict)
                and hits[0].get("revision") == self._revision
            )
        except (httpx.HTTPError, IndexUnavailable, ValueError, TypeError):
            return False

    async def search(self, query: str, *, service_filter: str | None = None) -> IndexSearchResult:
        bounded_query = query.strip()
        if not bounded_query or len(bounded_query) > 2_048:
            raise ValueError("invalid bounded retrieval query")
        filters = [f'revision = "{self._revision}"']
        if service_filter:
            if not service_filter.replace("-", "").isalnum() or len(service_filter) > 64:
                raise ValueError("invalid service filter")
            filters.append(f'serviceTags = "{service_filter}"')
        try:
            response = await self._http.post(
                f"{self._base_url}/indexes/{self._index_uid}/search",
                headers={"authorization": f"Bearer {self._api_key}"},
                json={
                    "q": bounded_query,
                    "limit": self._candidate_limit,
                    "filter": filters,
                    "showRankingScore": True,
                    "hybrid": {"embedder": "default", "semanticRatio": 0.5},
                    "attributesToRetrieve": [
                        "id",
                        "revision",
                        "sourcePath",
                        "canonicalUrl",
                        "verifiedAnchor",
                        "title",
                        "headingPath",
                        "serviceTags",
                        "language",
                        "content",
                        "normalizedContent",
                        "codeLanguages",
                        "tokenEstimate",
                        "contentHash",
                    ],
                },
                timeout=self._timeout,
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or not isinstance(payload.get("hits"), list):
                raise ValueError("malformed search response")
            hits = payload["hits"]
            if len(hits) > self._candidate_limit:
                raise ValueError("oversized search response")
            candidates = tuple(self._parse_hit(hit) for hit in hits)
            estimated = payload.get("estimatedTotalHits", len(candidates))
            count = min(max(int(estimated), len(candidates)), self._candidate_limit)
            return IndexSearchResult(candidates=candidates, candidate_count=count)
        except (httpx.HTTPError, ValidationError, ValueError, TypeError, KeyError) as exc:
            raise IndexUnavailable("documentation index unavailable") from exc

    def _parse_hit(self, raw: Any) -> IndexCandidate:
        if not isinstance(raw, dict):
            raise ValueError("invalid hit")
        passage_data = {_CAMEL_TO_SNAKE.get(key, key): value for key, value in raw.items() if not key.startswith("_")}
        passage = SourcePassage.model_validate(passage_data)
        if passage.revision != self._revision:
            raise ValueError("revision mismatch")
        score = float(raw.get("_rankingScore", 0.0))
        if not 0 <= score <= 1:
            raise ValueError("invalid ranking score")
        return IndexCandidate(passage=passage, score=score)
