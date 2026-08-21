from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class RequestOutcome(StrEnum):
    SUCCESS = "success"
    INVALID_REQUEST = "invalid_request"
    MODEL_REJECTED = "model_rejected"
    RATE_LIMITED = "rate_limited"
    QUOTA_EXHAUSTED = "quota_exhausted"
    STATE_UNAVAILABLE = "state_unavailable"
    UPSTREAM_ERROR = "upstream_error"
    TIMEOUT = "timeout"
    CLIENT_CANCELLED = "client_cancelled"
    MALFORMED_UPSTREAM = "malformed_upstream"
    INTERNAL_ERROR = "internal_error"


class UpstreamOutcome(StrEnum):
    SUCCESS = "success"
    HTTP_ERROR = "http_error"
    CONNECT_ERROR = "connect_error"
    TIMEOUT = "timeout"
    CLIENT_CANCELLED = "client_cancelled"
    MALFORMED_RESPONSE = "malformed_response"


class FailureCategory(StrEnum):
    DNS = "dns"
    TLS = "tls"
    CONNECT = "connect"
    POOL_TIMEOUT = "pool_timeout"
    WRITE_TIMEOUT = "write_timeout"
    READ_TIMEOUT = "read_timeout"
    TOTAL_TIMEOUT = "total_timeout"
    HTTP_4XX = "http_4xx"
    HTTP_5XX = "http_5xx"
    INVALID_JSON = "invalid_json"
    MALFORMED_SSE = "malformed_sse"
    OVERSIZED_RESPONSE = "oversized_response"
    PROTOCOL = "protocol"
    OTHER = "other"


class LimitScope(StrEnum):
    CLIENT = "client"
    GLOBAL = "global"


class LimitType(StrEnum):
    RPM = "rpm"
    TPM = "tpm"
    CONCURRENCY = "concurrency"
    QUOTA = "quota"
    COST = "cost"


class LogDropReason(StrEnum):
    QUEUE_FULL = "queue_full"
    SINK_ERROR = "sink_error"
    SERIALIZATION_ERROR = "serialization_error"


class GroundingRoute(StrEnum):
    DIRECT = "direct"
    COMPLEX = "complex"
    CLARIFY = "clarify"
    ABSTAIN = "abstain"
    OUT_OF_SCOPE = "out_of_scope"
    ELEVATED_RISK = "elevated_risk"
    UNKNOWN = "unknown"


class CacheOutcome(StrEnum):
    INELIGIBLE = "ineligible"
    MISS = "miss"
    HIT = "hit"
    STALE = "stale"
    ERROR = "error"


class BudgetResult(StrEnum):
    ALLOWED = "allowed"
    SHORTENED = "shortened"
    REJECTED = "rejected"


class Severity(StrEnum):
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class LogEvent(StrEnum):
    REQUEST_COMPLETED = "request.completed"
    SERVICE_STARTING = "service.starting"
    SERVICE_READY = "service.ready"
    SERVICE_UNREADY = "service.unready"
    SERVICE_STOPPING = "service.stopping"
    ENFORCEMENT_DEGRADED = "enforcement.degraded"
    SECURITY_REQUEST_REJECTED = "security.request_rejected"
    LOGGING_DEGRADED = "logging.degraded"


@dataclass(slots=True)
class RequestOutcomeState:
    request_id: str
    started_at: float
    status_code: int = 500
    response_complete: bool = False
    finalized: bool = False
    outcome: RequestOutcome = RequestOutcome.INTERNAL_ERROR
