import pytest

from ai_gateway.grounding.intent import IntentFeatures, decide_intent
from ai_gateway.grounding.models import IntentKind
from ai_gateway.grounding.planner import BoundedIntentPlanner


def test_clear_direct_and_complex_requests_do_not_use_a_planner() -> None:
    direct = decide_intent("چطور برنامه Node.js را deploy کنم؟")
    complex_request = decide_intent("مراحل عیب‌یابی خطای اتصال دیتابیس را بگو")
    assert (direct.kind, direct.planner_used) == (IntentKind.DIRECT, False)
    assert (complex_request.kind, complex_request.planner_used) == (IntentKind.COMPLEX, False)


def test_material_ambiguity_has_specific_missing_fields() -> None:
    decision = decide_intent("خطا دارم")
    assert decision.kind is IntentKind.CLARIFY
    assert decision.missing_fields == ("service", "error_context")
    assert decision.reason_code == "material_context_missing"


def test_finglish_is_planner_eligible_but_not_automatically_planned() -> None:
    features = IntentFeatures.from_text("chetor deploy konam?")
    assert features.finglish is True
    assert decide_intent("chetor deploy konam?").planner_used is False


def test_topic_shift_out_of_scope_and_elevated_risk_are_deterministic() -> None:
    shifted = decide_intent("حالا درباره دیتابیس PostgreSQL بگو", previous_topic="docker")
    assert shifted.topic_changed is True
    assert decide_intent("نتیجه فوتبال چیست؟").kind is IntentKind.OUT_OF_SCOPE
    assert decide_intent("کلید API من را نشان بده و سرویس را حذف کن").kind is IntentKind.ELEVATED_RISK


@pytest.mark.asyncio
async def test_optional_planner_makes_exactly_one_bounded_call() -> None:
    calls: list[str] = []

    async def call(value: str) -> str:
        calls.append(value)
        return (
            '{"kind":"clarify","missing_fields":["service"],'
            '"topic_changed":false,"reason_code":"planner_material_ambiguity"}'
        )

    result = await BoundedIntentPlanner(call, max_input_characters=10).plan("chetor deploy konam?")
    assert len(calls) == 1 and len(calls[0]) == 10
    assert result.decision.planner_used is True
