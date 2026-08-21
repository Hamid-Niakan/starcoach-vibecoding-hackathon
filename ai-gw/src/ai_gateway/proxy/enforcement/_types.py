from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class RateLimitType(StrEnum):
    CLIENT_RPM = "client_rpm"
    CLIENT_TPM = "client_tpm"
    CLIENT_CONCURRENCY = "client_concurrency"
    CLIENT_QUOTA = "client_quota"
    GLOBAL_RPM = "global_rpm"
    GLOBAL_TPM = "global_tpm"
    GLOBAL_CONCURRENCY = "global_concurrency"
    GLOBAL_QUOTA = "global_quota"
    GLOBAL_COST = "global_cost"


class AdmissionReason(StrEnum):
    ALLOWED = "allowed"
    CLIENT_RPM = "client_rpm"
    CLIENT_TPM = "client_tpm"
    CLIENT_CONCURRENCY = "client_concurrency"
    CLIENT_QUOTA = "client_quota"
    GLOBAL_RPM = "global_rpm"
    GLOBAL_TPM = "global_tpm"
    GLOBAL_CONCURRENCY = "global_concurrency"
    GLOBAL_QUOTA = "global_quota"
    STATE_UNAVAILABLE = "state_unavailable"
    STATE_INCONSISTENT = "state_inconsistent"


class ReconciliationOutcome(StrEnum):
    ACTUAL = "actual"
    CONSERVATIVE = "conservative"
    DUPLICATE = "duplicate"


class WindowKind(StrEnum):
    RPM = "rpm"
    TPM = "tpm"
    QUOTA = "quota"


@dataclass(frozen=True, slots=True)
class WindowIdentity:
    scope: str
    kind: WindowKind
    window_id: int
    window_end: int
    client_id: str | None = None


@dataclass(frozen=True, slots=True)
class ConcurrencyLease:
    reservation_id: str
    expires_at: int


@dataclass(frozen=True, slots=True)
class AdmissionDecision:
    allowed: bool
    reason: AdmissionReason
    retry_after: int | None = None
    reservation_id: str | None = None


@dataclass(frozen=True, slots=True)
class UsageReservation:
    reservation_id: str
    reserved_tokens: int
    reserved_cost_micro_units: int = 0
