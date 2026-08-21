from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from pathlib import PurePosixPath
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator


class RevisionStatus(StrEnum):
    BUILDING = "building"
    VALIDATING = "validating"
    ACTIVE = "active"
    SUPERSEDED = "superseded"
    FAILED = "failed"


class IntentKind(StrEnum):
    DIRECT = "direct"
    COMPLEX = "complex"
    CLARIFY = "clarify"
    ABSTAIN = "abstain"
    OUT_OF_SCOPE = "out_of_scope"
    ELEVATED_RISK = "elevated_risk"


class ConfidenceBand(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    CONFLICT = "conflict"


class CacheOutcome(StrEnum):
    INELIGIBLE = "ineligible"
    MISS = "miss"
    HIT = "hit"
    STALE = "stale"
    ERROR = "error"


class CitationValidation(StrEnum):
    VALID = "valid"
    STALE = "stale"
    INVALID = "invalid"


class AnswerPath(StrEnum):
    GENERATED = "generated"
    CLARIFICATION = "clarification"
    ABSTENTION = "abstention"
    EXACT_CACHE = "exact_cache"


class ReusableArtifactKind(StrEnum):
    RETRIEVAL_RESULT = "retrieval_result"
    REVIEWED_EXACT_ANSWER = "reviewed_exact_answer"


class RequestOutcome(StrEnum):
    SUCCESS = "success"
    CLARIFICATION = "clarification"
    ABSTENTION = "abstention"
    STOPPED = "stopped"
    FAILED = "failed"
    REJECTED = "rejected"


_SHA256_PATTERN = r"^[a-f0-9]{64}$"
_SAFE_VERSION_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$"


class FrozenModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class ApprovedDocumentationRevision(FrozenModel):
    revision: str = Field(pattern=_SHA256_PATTERN)
    upstream_revision: str = Field(pattern=r"^[a-f0-9]{7,40}$")
    schema_version: Literal[1]
    chunker_version: str = Field(pattern=_SAFE_VERSION_PATTERN)
    embedder_revision_digest: str = Field(pattern=_SHA256_PATTERN)
    aggregate_checksum: str = Field(pattern=_SHA256_PATTERN)
    page_count: int = Field(gt=0)
    chunk_count: int = Field(gt=0)
    built_at: datetime
    status: RevisionStatus
    index_uid: str | None = Field(default=None, pattern=r"^liara_docs_[a-f0-9]{12,64}$")
    route_inventory_checksum: str | None = Field(default=None, pattern=_SHA256_PATTERN)
    policy_digest: str | None = Field(default=None, pattern=_SHA256_PATTERN)

    @field_validator("built_at")
    @classmethod
    def timestamp_must_be_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("timezone_required")
        return value


class SourcePassage(FrozenModel):
    id: str = Field(min_length=16, max_length=128)
    revision: str = Field(pattern=_SHA256_PATTERN)
    source_path: str = Field(min_length=1, max_length=512)
    canonical_url: HttpUrl
    verified_anchor: str | None = Field(default=None, max_length=240)
    title: str = Field(min_length=1, max_length=240)
    heading_path: tuple[str, ...] = Field(max_length=12)
    service_tags: tuple[str, ...] = Field(max_length=16)
    language: Literal["fa", "en", "mixed", "unknown"]
    content: str = Field(min_length=1, max_length=131_072)
    normalized_content: str = Field(min_length=1, max_length=131_072)
    code_languages: tuple[str, ...] = Field(max_length=16)
    token_estimate: int = Field(gt=0, le=1_200)
    content_hash: str = Field(pattern=_SHA256_PATTERN)

    @field_validator("source_path")
    @classmethod
    def source_path_must_be_relative(cls, value: str) -> str:
        path = PurePosixPath(value)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("unsafe_source_path")
        return path.as_posix()

    @field_validator("canonical_url")
    @classmethod
    def canonical_url_is_approved(cls, value: HttpUrl) -> HttpUrl:
        if value.scheme != "https" or value.host != "docs.liara.ir" or value.username or value.password:
            raise ValueError("unapproved_canonical_url")
        return value

    @field_validator("heading_path", "service_tags", "code_languages")
    @classmethod
    def tuple_values_are_unique_and_bounded(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if len(set(value)) != len(value) or any(not item or len(item) > 240 for item in value):
            raise ValueError("invalid_bounded_tuple")
        return value


MissingField = Literal["service", "runtime", "version", "environment", "goal", "error_context"]


class IntentDecision(FrozenModel):
    kind: IntentKind
    missing_fields: tuple[MissingField, ...] = Field(default=(), max_length=5)
    topic_changed: bool
    reason_code: str = Field(pattern=r"^[a-z0-9_]{1,64}$")
    planner_used: bool

    @field_validator("missing_fields")
    @classmethod
    def missing_fields_are_unique(cls, value: tuple[MissingField, ...]) -> tuple[MissingField, ...]:
        if len(set(value)) != len(value):
            raise ValueError("duplicate_missing_field")
        return value


class RetrievalDecision(FrozenModel):
    query_fingerprint: str = Field(pattern=_SHA256_PATTERN)
    revision: str = Field(pattern=_SHA256_PATTERN)
    policy_version: str = Field(pattern=_SAFE_VERSION_PATTERN)
    candidate_count: int = Field(ge=0, le=100)
    selected_passage_ids: tuple[str, ...] = Field(max_length=12)
    retrieval_tokens: int = Field(ge=0)
    confidence_band: ConfidenceBand
    cache_outcome: CacheOutcome

    @field_validator("selected_passage_ids")
    @classmethod
    def selected_passages_are_unique(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if len(set(value)) != len(value):
            raise ValueError("duplicate_selected_passage")
        if any(len(item) < 16 or len(item) > 128 for item in value):
            raise ValueError("invalid_passage_id")
        return value

    def assert_within_limits(self, *, passage_limit: int, token_limit: int) -> None:
        if len(self.selected_passage_ids) > passage_limit:
            raise ValueError("retrieval_passage_limit")
        if self.retrieval_tokens > token_limit:
            raise ValueError("retrieval_token_limit")


class Citation(FrozenModel):
    id: str = Field(pattern=r"^c[1-9][0-9]?$")
    marker: int = Field(ge=1, le=12)
    passage_id: str = Field(min_length=16, max_length=128)
    title: str = Field(min_length=1, max_length=240)
    url: HttpUrl
    heading: str | None = Field(default=None, max_length=240)
    documentation_revision: str = Field(pattern=_SHA256_PATTERN)
    validation: CitationValidation

    @field_validator("url")
    @classmethod
    def citation_url_is_approved(cls, value: HttpUrl) -> HttpUrl:
        if value.scheme != "https" or value.host != "docs.liara.ir" or value.username or value.password:
            raise ValueError("unapproved_citation_url")
        return value

    def assert_traceable(self, revision: str, selected_passage_ids: tuple[str, ...]) -> None:
        if self.documentation_revision != revision:
            raise ValueError("citation_revision_mismatch")
        if self.passage_id not in selected_passage_ids:
            raise ValueError("citation_passage_not_selected")
        if self.validation is not CitationValidation.VALID:
            raise ValueError("citation_not_valid")


class AnswerBudget(FrozenModel):
    route: IntentKind
    history_tokens: int = Field(ge=0)
    retrieval_tokens: int = Field(ge=0)
    planner_input_tokens: int = Field(ge=0)
    planner_output_tokens: int = Field(ge=0)
    generation_input_tokens: int = Field(ge=0)
    generation_output_tokens: int = Field(gt=0)
    max_cost_micro_units: int = Field(gt=0)

    @property
    def reserved_tokens(self) -> int:
        return (
            self.history_tokens
            + self.retrieval_tokens
            + self.planner_input_tokens
            + self.planner_output_tokens
            + self.generation_input_tokens
            + self.generation_output_tokens
        )


class ReusableArtifact(FrozenModel):
    kind: ReusableArtifactKind
    key: str = Field(pattern=_SHA256_PATTERN)
    revision: str = Field(pattern=_SHA256_PATTERN)
    policy_version: str = Field(pattern=_SAFE_VERSION_PATTERN)
    passage_ids: tuple[str, ...] = Field(default=(), max_length=12)
    answer: str | None = Field(default=None, max_length=65_536)
    created_at: datetime
    expires_at: datetime

    @model_validator(mode="after")
    def validate_artifact(self) -> ReusableArtifact:
        if self.created_at.tzinfo is None or self.expires_at.tzinfo is None:
            raise ValueError("timezone_required")
        if self.expires_at <= self.created_at:
            raise ValueError("artifact_expiry_required")
        if self.kind is ReusableArtifactKind.RETRIEVAL_RESULT and (not self.passage_ids or self.answer is not None):
            raise ValueError("invalid_retrieval_artifact")
        if self.kind is ReusableArtifactKind.REVIEWED_EXACT_ANSWER and not self.answer:
            raise ValueError("answer_artifact_required")
        return self


class UsageRecord(FrozenModel):
    request_id: str = Field(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
    timestamp: datetime
    deployment_digest: str = Field(pattern=_SHA256_PATTERN)
    pipeline_digest: str = Field(pattern=_SHA256_PATTERN)
    corpus_revision_digest: str = Field(pattern=_SHA256_PATTERN)
    intent: IntentKind
    answer_path: AnswerPath
    cache_outcome: CacheOutcome
    candidate_count: int = Field(ge=0, le=100)
    selected_count: int = Field(ge=0, le=12)
    retrieval_tokens: int = Field(ge=0)
    planning_input_tokens: int = Field(ge=0)
    planning_output_tokens: int = Field(ge=0)
    generation_input_tokens: int = Field(ge=0)
    generation_output_tokens: int = Field(ge=0)
    charged_tokens: int = Field(ge=0)
    ttft_ms: int = Field(ge=0)
    total_latency_ms: int = Field(ge=0)
    estimated_cost_micro_units: int = Field(ge=0)
    outcome: RequestOutcome
    failure_category: str | None = Field(default=None, pattern=r"^[a-z0-9_]{1,64}$")

    @field_validator("timestamp")
    @classmethod
    def usage_timestamp_is_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("timezone_required")
        return value
