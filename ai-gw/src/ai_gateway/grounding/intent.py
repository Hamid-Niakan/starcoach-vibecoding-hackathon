from __future__ import annotations

import re
from dataclasses import dataclass

from ai_gateway.grounding.models import IntentDecision, IntentKind, MissingField

_FINGLISH = frozenset({"chetor", "chera", "konam", "mishe", "deploy", "error", "database"})
_SERVICE_TOPICS = {
    "docker": frozenset({"docker", "container", "کانتینر", "داکر"}),
    "database": frozenset({"postgres", "postgresql", "mysql", "database", "دیتابیس", "پایگاه"}),
    "domain": frozenset({"domain", "dns", "دامنه"}),
    "storage": frozenset({"storage", "bucket", "object", "فضای", "ذخیره"}),
}


@dataclass(frozen=True, slots=True)
class IntentFeatures:
    text: str
    tokens: frozenset[str]
    finglish: bool
    topic: str | None

    @classmethod
    def from_text(cls, text: str) -> IntentFeatures:
        normalized = text.casefold().strip()
        tokens = frozenset(re.findall(r"[\w.+-]+", normalized, flags=re.UNICODE))
        topic = next((name for name, terms in _SERVICE_TOPICS.items() if tokens & terms), None)
        latin = {token for token in tokens if token.isascii()}
        return cls(normalized, tokens, len(latin & _FINGLISH) >= 2, topic)


def decide_intent(text: str, *, previous_topic: str | None = None) -> IntentDecision:
    features = IntentFeatures.from_text(text)
    topic_changed = bool(previous_topic and features.topic and previous_topic != features.topic)
    if any(
        term in features.text for term in ("کلید api من", "api key من", "رمز من", "حذف کن", "delete my", "انجامش بده")
    ):
        return IntentDecision(
            kind=IntentKind.ELEVATED_RISK,
            missing_fields=(),
            topic_changed=topic_changed,
            reason_code="account_or_live_action",
            planner_used=False,
        )
    if any(term in features.text for term in ("فوتبال", "هواشناسی", "بورس", "recipe", "football")):
        return IntentDecision(
            kind=IntentKind.OUT_OF_SCOPE,
            missing_fields=(),
            topic_changed=topic_changed,
            reason_code="outside_liara_docs",
            planner_used=False,
        )
    if not features.text or features.text in {"کمک", "help", "خطا دارم", "کار نمی‌کند"}:
        missing: tuple[MissingField, ...] = (
            ("service", "error_context") if "خطا" in features.text or "نمی" in features.text else ("goal",)
        )
        return IntentDecision(
            kind=IntentKind.CLARIFY,
            missing_fields=missing,
            topic_changed=topic_changed,
            reason_code="material_context_missing",
            planner_used=False,
        )
    if any(term in features.text for term in ("مقایسه", "compare", "مراحل", "گام", "عیب", "troubleshoot", "migration")):
        return IntentDecision(
            kind=IntentKind.COMPLEX,
            missing_fields=(),
            topic_changed=topic_changed,
            reason_code="multi_step_or_comparison",
            planner_used=False,
        )
    return IntentDecision(
        kind=IntentKind.DIRECT,
        missing_fields=(),
        topic_changed=topic_changed,
        reason_code="clear_documentation_question",
        planner_used=False,
    )


def planner_eligible(
    features: IntentFeatures, decision: IntentDecision, *, weak_complex_retrieval: bool = False
) -> bool:
    return (
        features.finglish
        or decision.kind is IntentKind.CLARIFY
        or (decision.kind is IntentKind.COMPLEX and weak_complex_retrieval)
    )
