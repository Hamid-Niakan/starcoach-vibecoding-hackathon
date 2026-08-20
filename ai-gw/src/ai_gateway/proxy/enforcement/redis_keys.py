from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class EnforcementKeys:
    deployment_id: str
    epoch: str

    @property
    def prefix(self) -> str:
        return f"aigw:enforcement:v1:{{{self.deployment_id}:{self.epoch}}}"

    @property
    def marker(self) -> str:
        return f"{self.prefix}:marker"

    @property
    def inconsistent(self) -> str:
        return f"{self.prefix}:inconsistent"

    def reservation(self, reservation_id: str) -> str:
        return f"{self.prefix}:reservation:{reservation_id}"


def window_ttl_seconds(window_end: int, redis_now: int, maximum_lifetime: int, grace_seconds: int) -> int:
    return max(1, window_end - redis_now + maximum_lifetime + grace_seconds)
