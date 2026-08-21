from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from ai_gateway.grounding.cost import estimate_cost_micro_units
from ai_gateway.grounding.models import AnswerBudget, IntentKind
from ai_gateway.proxy.proxy_config import ProxyConfig


class BudgetDecision(StrEnum):
    ALLOWED = "allowed"
    SHORTENED = "shortened"


@dataclass(frozen=True, slots=True)
class RouteBudget:
    answer_budget: AnswerBudget
    decision: BudgetDecision

    @property
    def reserved_tokens(self) -> int:
        return self.answer_budget.reserved_tokens

    @property
    def history_tokens(self) -> int:
        return self.answer_budget.history_tokens

    @property
    def retrieval_tokens(self) -> int:
        return self.answer_budget.retrieval_tokens

    @property
    def planner_input_tokens(self) -> int:
        return self.answer_budget.planner_input_tokens

    @property
    def planner_output_tokens(self) -> int:
        return self.answer_budget.planner_output_tokens

    @property
    def generation_input_tokens(self) -> int:
        return self.answer_budget.generation_input_tokens

    @property
    def generation_output_tokens(self) -> int:
        return self.answer_budget.generation_output_tokens


@dataclass(frozen=True, slots=True)
class ReconciledBudget:
    planner_tokens: int
    generation_tokens: int
    total_tokens: int
    estimated_cost_micro_units: int


def build_route_budget(
    config: ProxyConfig,
    *,
    route: IntentKind,
    history_tokens: int,
    planner_enabled: bool,
    max_cost_micro_units: int | None = None,
) -> RouteBudget:
    if history_tokens < 0:
        raise ValueError("negative_history_tokens")
    complex_route = route is IntentKind.COMPLEX
    clarify_route = route in {
        IntentKind.CLARIFY,
        IntentKind.ABSTAIN,
        IntentKind.OUT_OF_SCOPE,
        IntentKind.ELEVATED_RISK,
    }
    retrieval_tokens = (
        0 if clarify_route else (config.complex_context_tokens if complex_route else config.direct_context_tokens)
    )
    output_tokens = (
        config.clarify_output_tokens
        if clarify_route
        else config.complex_output_tokens
        if complex_route
        else config.direct_output_tokens
    )
    planner_input = min(1_000, config.model_max_input_tokens // 8) if planner_enabled else 0
    planner_output = min(200, config.max_output_tokens) if planner_enabled else 0
    fixed_inputs = retrieval_tokens + planner_input + planner_output
    maximum_history = max(0, config.model_max_input_tokens - retrieval_tokens)
    bounded_history = min(history_tokens, maximum_history)
    decision = BudgetDecision.SHORTENED if bounded_history != history_tokens else BudgetDecision.ALLOWED
    generation_input = min(config.model_max_input_tokens, bounded_history + retrieval_tokens)
    maximum_cost = max_cost_micro_units or config.daily_cost_budget_micro
    reserved_cost = estimate_cost_micro_units(
        generation_input + planner_input,
        output_tokens + planner_output,
        input_rate_micro_per_million=config.input_cost_micro_per_million,
        output_rate_micro_per_million=config.output_cost_micro_per_million,
    )
    if fixed_inputs > config.model_max_input_tokens + config.max_output_tokens or reserved_cost > maximum_cost:
        raise ValueError("route_budget_exceeded")
    budget = AnswerBudget(
        route=route,
        history_tokens=bounded_history,
        retrieval_tokens=retrieval_tokens,
        planner_input_tokens=planner_input,
        planner_output_tokens=planner_output,
        generation_input_tokens=generation_input,
        generation_output_tokens=output_tokens,
        max_cost_micro_units=maximum_cost,
    )
    return RouteBudget(budget, decision)


def reconcile_budget(
    budget: RouteBudget,
    *,
    planner_input_tokens: int,
    planner_output_tokens: int,
    generation_input_tokens: int,
    generation_output_tokens: int,
    input_rate_micro_per_million: int = 0,
    output_rate_micro_per_million: int = 0,
) -> ReconciledBudget:
    values = (
        planner_input_tokens,
        planner_output_tokens,
        generation_input_tokens,
        generation_output_tokens,
    )
    if min(values) < 0:
        raise ValueError("negative_actual_tokens")
    planner_tokens = planner_input_tokens + planner_output_tokens
    generation_tokens = generation_input_tokens + generation_output_tokens
    total = planner_tokens + generation_tokens
    if total > budget.reserved_tokens:
        raise ValueError("budget_under_reserved")
    return ReconciledBudget(
        planner_tokens=planner_tokens,
        generation_tokens=generation_tokens,
        total_tokens=total,
        estimated_cost_micro_units=estimate_cost_micro_units(
            planner_input_tokens + generation_input_tokens,
            planner_output_tokens + generation_output_tokens,
            input_rate_micro_per_million=input_rate_micro_per_million,
            output_rate_micro_per_million=output_rate_micro_per_million,
        ),
    )
