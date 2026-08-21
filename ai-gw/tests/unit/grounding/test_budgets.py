from __future__ import annotations

import pytest
from pydantic import SecretStr

from ai_gateway.grounding.budgets import BudgetDecision, build_route_budget, reconcile_budget
from ai_gateway.grounding.cost import AggregateBudget, estimate_cost_micro_units
from ai_gateway.grounding.models import IntentKind
from ai_gateway.proxy.proxy_config import ProxyConfig


@pytest.fixture
def proxy_config() -> ProxyConfig:
    return ProxyConfig(
        model_name="liara-assistant",
        litellm_params={
            "model": "protected-model",
            "api_base": "http://127.0.0.1:8080/v1",
            "api_key": "fixture-secret-not-for-production",
        },
        redis_url=SecretStr("redis://127.0.0.1:6379/15"),
        deployment_id="test",
        enforcement_epoch="v1",
        identity_secret=SecretStr("0" * 32),
        model_max_input_tokens=8192,
        allow_insecure_local_upstream=True,
        allow_private_upstream=True,
        input_cost_micro_per_million=1_000_000,
        output_cost_micro_per_million=2_000_000,
        daily_cost_budget_micro=1_000_000,
    )


def test_complex_budget_reserves_hidden_planner_and_generation_calls(proxy_config) -> None:
    budget = build_route_budget(
        proxy_config,
        route=IntentKind.COMPLEX,
        history_tokens=900,
        planner_enabled=True,
    )
    assert budget.planner_input_tokens > 0
    assert budget.planner_output_tokens > 0
    assert budget.retrieval_tokens == proxy_config.complex_context_tokens
    assert budget.generation_output_tokens == proxy_config.complex_output_tokens
    assert budget.reserved_tokens >= sum(
        (
            budget.history_tokens,
            budget.retrieval_tokens,
            budget.planner_input_tokens,
            budget.planner_output_tokens,
            budget.generation_output_tokens,
        )
    )


def test_preflight_shortens_history_then_rejects_unaffordable_route(proxy_config) -> None:
    shortened = build_route_budget(
        proxy_config,
        route=IntentKind.DIRECT,
        history_tokens=proxy_config.model_max_input_tokens,
        planner_enabled=False,
    )
    assert shortened.history_tokens < proxy_config.model_max_input_tokens
    assert shortened.decision is BudgetDecision.SHORTENED

    with pytest.raises(ValueError, match="route_budget_exceeded"):
        build_route_budget(
            proxy_config,
            route=IntentKind.COMPLEX,
            history_tokens=0,
            planner_enabled=True,
            max_cost_micro_units=1,
        )


def test_integer_cost_rounds_up_without_float_error() -> None:
    assert (
        estimate_cost_micro_units(
            1,
            0,
            input_rate_micro_per_million=1,
            output_rate_micro_per_million=1,
        )
        == 1
    )
    assert (
        estimate_cost_micro_units(
            1_000_000,
            2_000_000,
            input_rate_micro_per_million=3,
            output_rate_micro_per_million=5,
        )
        == 13
    )


def test_budget_reconciliation_counts_planner_exactly_once(proxy_config) -> None:
    budget = build_route_budget(
        proxy_config,
        route=IntentKind.COMPLEX,
        history_tokens=100,
        planner_enabled=True,
    )
    actual = reconcile_budget(
        budget,
        planner_input_tokens=17,
        planner_output_tokens=9,
        generation_input_tokens=101,
        generation_output_tokens=33,
    )
    assert actual.total_tokens == 160
    assert actual.planner_tokens == 26


def test_aggregate_cost_thresholds_are_closed_and_deterministic() -> None:
    policy = AggregateBudget(limit_micro_units=1000, warning_percent=80)
    assert policy.decide(current_micro_units=798, reservation_micro_units=1).value == "allowed"
    assert policy.decide(current_micro_units=799, reservation_micro_units=2).value == "warning"
    assert policy.decide(current_micro_units=999, reservation_micro_units=2).value == "rejected"
