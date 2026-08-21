from __future__ import annotations

import pytest

from ai_gateway.grounding.intent import decide_intent
from ai_gateway.grounding.models import IntentKind


@pytest.mark.parametrize(
    ("query", "expected", "must_not_contain"),
    [
        ("چطور برنامه Docker را deploy کنم؟", IntentKind.DIRECT, ""),
        ("خطا دارم", IntentKind.CLARIFY, ""),
        ("مراحل عیب‌یابی اتصال PostgreSQL را بگو", IntentKind.COMPLEX, ""),
        ("وضعیت حساب من را ببین و سرویس را حذف کن", IntentKind.ELEVATED_RISK, "success"),
        ("نتیجه فوتبال چیست؟", IntentKind.OUT_OF_SCOPE, ""),
    ],
)
def test_fixed_agentic_route_cases(query: str, expected: IntentKind, must_not_contain: str) -> None:
    decision = decide_intent(query)
    assert decision.kind is expected
    assert decision.planner_used is False
    if must_not_contain:
        assert must_not_contain not in decision.reason_code


def test_clear_question_is_not_unnecessarily_clarified_and_topic_shift_is_visible() -> None:
    assert decide_intent("PORT برنامه Node.js را چطور تنظیم کنم؟").kind is IntentKind.DIRECT
    shifted = decide_intent("حالا پشتیبان PostgreSQL را توضیح بده", previous_topic="docker")
    assert shifted.topic_changed is True
