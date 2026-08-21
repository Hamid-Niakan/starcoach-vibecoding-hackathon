from __future__ import annotations

import hashlib
import hmac
import json
import re
from collections import OrderedDict
from collections.abc import Awaitable
from datetime import UTC, datetime, timedelta
from typing import Protocol

from redis.asyncio import Redis

from ai_gateway.grounding.models import Citation, CitationValidation
from ai_gateway.grounding.retrieval import normalize_query


class CacheBackend(Protocol):
    def get(self, key: str) -> Awaitable[bytes | None]: ...

    def set(self, key: str, value: bytes, ttl_seconds: int) -> Awaitable[object]: ...


class MemoryCacheBackend:
    def __init__(self) -> None:
        self.values: OrderedDict[str, tuple[bytes, datetime]] = OrderedDict()

    async def get(self, key: str) -> bytes | None:
        value = self.values.get(key)
        if value is None:
            return None
        self.values.move_to_end(key)
        return value[0]

    async def set(self, key: str, value: bytes, ttl_seconds: int) -> None:
        self.values[key] = (value, datetime.now(UTC) + timedelta(seconds=ttl_seconds))
        self.values.move_to_end(key)


class RedisCacheBackend:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def get(self, key: str) -> bytes | None:
        value = await self._redis.get(key)
        if value is None:
            return None
        return value.encode() if isinstance(value, str) else bytes(value)

    async def set(self, key: str, value: bytes, ttl_seconds: int) -> None:
        await self._redis.set(key, value, ex=ttl_seconds)


_PROHIBITED = re.compile(
    r"(?ix)(?:api[_-]?key|secret|token|password)\s*[:=]|"
    r"\bsk-[a-z0-9_-]{12,}\b|"
    r"\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|"
    r"\b09\d{9}\b|"
    r"\bmerchant[_ -]?id\s*[:=]?\s*\d{6,}\b|"
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b"
)


def reviewed_answer_eligible(answer: str, *, citations: tuple[Citation, ...], reviewed: bool) -> bool:
    return bool(
        reviewed
        and answer.strip()
        and not _PROHIBITED.search(answer)
        and citations
        and all(citation.validation is CitationValidation.VALID for citation in citations)
    )


class GroundingCache:
    def __init__(
        self,
        backend: CacheBackend,
        *,
        secret: bytes,
        ttl_seconds: int = 3600,
        max_entries: int = 10_000,
    ) -> None:
        if len(secret) < 32 or not 1 <= ttl_seconds <= 3600 or max_entries <= 0:
            raise ValueError("invalid_cache_policy")
        self._backend = backend
        self._secret = secret
        self._ttl = ttl_seconds
        self._max_entries = max_entries
        self._local_keys: OrderedDict[str, None] = OrderedDict()

    def retrieval_key(self, query: str, *, revision: str, policy_version: str) -> str:
        material = f"retrieval\0{revision}\0{policy_version}\0{normalize_query(query)}"
        return hmac.new(self._secret, material.encode(), hashlib.sha256).hexdigest()

    def reviewed_answer_key(self, case_id: str, *, locale: str, revision: str, policy_version: str) -> str:
        material = f"reviewed-answer\0{revision}\0{policy_version}\0{locale}\0{case_id}"
        return hmac.new(self._secret, material.encode(), hashlib.sha256).hexdigest()

    async def get_retrieval(
        self,
        query: str,
        *,
        revision: str,
        policy_version: str,
        now: datetime | None = None,
    ) -> tuple[str, ...] | None:
        key = self.retrieval_key(query, revision=revision, policy_version=policy_version)
        try:
            raw = await self._backend.get(key)
            if raw is None:
                return None
            payload = json.loads(raw)
            current = now or datetime.now(UTC)
            if payload.get("revision") != revision or datetime.fromisoformat(payload["expires_at"]) <= current:
                return None
            values = payload.get("passage_ids")
            if not isinstance(values, list) or not 1 <= len(values) <= 12:
                return None
            if any(not isinstance(item, str) or not 16 <= len(item) <= 128 for item in values):
                return None
            return tuple(values)
        except Exception:
            return None

    async def put_retrieval(
        self,
        query: str,
        passage_ids: tuple[str, ...],
        *,
        revision: str,
        policy_version: str,
        now: datetime | None = None,
    ) -> bool:
        if not 1 <= len(passage_ids) <= 12:
            return False
        current = now or datetime.now(UTC)
        key = self.retrieval_key(query, revision=revision, policy_version=policy_version)
        payload = json.dumps(
            {
                "revision": revision,
                "passage_ids": list(passage_ids),
                "expires_at": (current + timedelta(seconds=self._ttl)).isoformat(),
            },
            separators=(",", ":"),
        ).encode()
        try:
            await self._backend.set(key, payload, self._ttl)
            self._local_keys[key] = None
            self._local_keys.move_to_end(key)
            while len(self._local_keys) > self._max_entries:
                evicted, _ = self._local_keys.popitem(last=False)
                values = getattr(self._backend, "values", None)
                if isinstance(values, dict):
                    values.pop(evicted, None)
            return True
        except Exception:
            return False

    async def get_reviewed_answer(
        self,
        case_id: str,
        *,
        locale: str,
        revision: str,
        policy_version: str,
        now: datetime | None = None,
    ) -> tuple[str, tuple[str, ...]] | None:
        key = self.reviewed_answer_key(
            case_id,
            locale=locale,
            revision=revision,
            policy_version=policy_version,
        )
        try:
            raw = await self._backend.get(key)
            if raw is None:
                return None
            payload = json.loads(raw)
            current = now or datetime.now(UTC)
            if payload.get("revision") != revision or datetime.fromisoformat(payload["expires_at"]) <= current:
                return None
            answer = payload.get("answer")
            passage_ids = payload.get("passage_ids")
            if not isinstance(answer, str) or not isinstance(passage_ids, list):
                return None
            if not answer or len(answer) > 65_536 or not 1 <= len(passage_ids) <= 12:
                return None
            return answer, tuple(str(item) for item in passage_ids)
        except Exception:
            return None

    async def put_reviewed_answer(
        self,
        case_id: str,
        answer: str,
        *,
        citations: tuple[Citation, ...],
        reviewed: bool,
        locale: str,
        revision: str,
        policy_version: str,
        now: datetime | None = None,
    ) -> bool:
        if not reviewed_answer_eligible(answer, citations=citations, reviewed=reviewed) or any(
            citation.documentation_revision != revision for citation in citations
        ):
            return False
        current = now or datetime.now(UTC)
        key = self.reviewed_answer_key(
            case_id,
            locale=locale,
            revision=revision,
            policy_version=policy_version,
        )
        payload = json.dumps(
            {
                "revision": revision,
                "answer": answer,
                "passage_ids": [citation.passage_id for citation in citations],
                "expires_at": (current + timedelta(seconds=self._ttl)).isoformat(),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode()
        try:
            await self._backend.set(key, payload, self._ttl)
            return True
        except Exception:
            return False
