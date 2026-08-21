from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from ai_gateway.grounding.models import IntentDecision


@dataclass(frozen=True, slots=True)
class PlannerResult:
    decision: IntentDecision
    input_characters: int
    output_characters: int


class BoundedIntentPlanner:
    """Optional single-call planner; provider wiring remains an injected locked destination."""

    def __init__(
        self,
        call: Callable[[str], Awaitable[str]],
        *,
        max_input_characters: int = 4_000,
        max_output_characters: int = 1_000,
    ) -> None:
        self._call = call
        self._max_input = max_input_characters
        self._max_output = max_output_characters

    async def plan(self, query: str) -> PlannerResult:
        bounded = query[: self._max_input]
        raw = await self._call(bounded)
        if len(raw) > self._max_output:
            raise ValueError("planner_output_limit")
        payload = json.loads(raw)
        decision = IntentDecision.model_validate({**payload, "planner_used": True})
        return PlannerResult(decision=decision, input_characters=len(bounded), output_characters=len(raw))
