from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from ai_gateway.grounding.budgets import RouteBudget, build_route_budget
from ai_gateway.grounding.citations import SAFE_ABSTENTION, ValidatedAnswer, validate_grounded_answer
from ai_gateway.grounding.index_client import IndexSearchResult
from ai_gateway.grounding.intent import IntentFeatures, decide_intent, planner_eligible
from ai_gateway.grounding.models import AnswerPath, ConfidenceBand, IntentDecision, IntentKind, SourcePassage
from ai_gateway.grounding.planner import BoundedIntentPlanner
from ai_gateway.grounding.prompt import GroundedPrompt, build_grounded_prompt
from ai_gateway.grounding.retrieval import RetrievalCandidate, RetrievalSelection, select_passages
from ai_gateway.proxy._types import ProxyChatCompletionRequest
from ai_gateway.proxy.proxy_config import ProxyConfig


class SearchIndex(Protocol):
    async def search(self, query: str, *, service_filter: str | None = None) -> IndexSearchResult: ...


@dataclass(frozen=True, slots=True)
class PreparedGrounding:
    decision: IntentDecision
    answer_path: AnswerPath
    passages: tuple[SourcePassage, ...]
    prompt: GroundedPrompt | None
    fixed_answer: str | None
    revision: str
    budget: RouteBudget
    planner_input_tokens: int = 0
    planner_output_tokens: int = 0

    @property
    def intent(self) -> IntentKind:
        return self.decision.kind

    def finalize(self, answer: str) -> ValidatedAnswer:
        if self.answer_path is not AnswerPath.GENERATED:
            return ValidatedAnswer(
                content=self.fixed_answer or answer,
                citations=(),
                abstained=self.answer_path is AnswerPath.ABSTENTION,
            )
        return validate_grounded_answer(answer, self.passages)

    def metadata(self, answer: ValidatedAnswer) -> dict[str, Any]:
        path = AnswerPath.ABSTENTION if answer.abstained else self.answer_path
        workflow = None
        if self.intent is IntentKind.COMPLEX:
            workflow = {
                "id": "guided-resolution",
                "goal": "اجرای مرحله‌به‌مرحله راهنمای مستندات",
                "steps": [
                    {"id": "prerequisites", "label": "بررسی پیش‌نیازها", "status": "current"},
                    {"id": "implementation", "label": "اجرای مراحل", "status": "pending"},
                    {"id": "verification", "label": "بررسی نتیجه", "status": "pending"},
                ],
            }
        return {
            "schema_version": 1,
            "documentation_revision": self.revision,
            "intent": {
                "kind": self.intent.value,
                "missing_fields": list(self.decision.missing_fields),
                "topic_changed": self.decision.topic_changed,
            },
            "answer_path": path.value,
            "citations": [citation.model_dump(mode="json") for citation in answer.citations],
            "next_steps": [{"id": "verify", "label": "روش بررسی نتیجه", "prompt": "چطور نتیجه این مراحل را بررسی کنم؟"}]
            if self.intent in {IntentKind.DIRECT, IntentKind.COMPLEX}
            else [],
            "workflow": workflow,
            "reuse": "none",
        }


class GroundingOrchestrator:
    def __init__(self, config: ProxyConfig, index: SearchIndex, planner: BoundedIntentPlanner | None = None) -> None:
        if not config.liara_grounding_enabled or config.liara_corpus_revision is None:
            raise ValueError("grounding orchestrator requires an approved revision")
        self._config = config
        self._index = index
        self._planner = planner

    def preview_budget(self, request: ProxyChatCompletionRequest) -> RouteBudget:
        query = self._latest_user_text(request)
        decision = decide_intent(query, previous_topic=self._previous_topic(request))
        planner_enabled = self._planner is not None and planner_eligible(IntentFeatures.from_text(query), decision)
        history_tokens = sum(
            max(1, len(message.content) // 4) for message in request.messages if isinstance(message.content, str)
        )
        return build_route_budget(
            self._config,
            route=decision.kind,
            history_tokens=history_tokens,
            planner_enabled=planner_enabled,
        )

    async def prepare(
        self,
        request: ProxyChatCompletionRequest,
        budget: RouteBudget | None = None,
    ) -> PreparedGrounding:
        query = self._latest_user_text(request)
        decision = decide_intent(query, previous_topic=self._previous_topic(request))
        planner_input_tokens = 0
        planner_output_tokens = 0
        if self._planner is not None and planner_eligible(IntentFeatures.from_text(query), decision):
            try:
                planned = await self._planner.plan(query)
                decision = planned.decision
                planner_input_tokens = (planned.input_characters + 3) // 4
                planner_output_tokens = (planned.output_characters + 3) // 4
            except (ValueError, TypeError):
                pass
        budget = budget or self.preview_budget(request)
        intent = decision.kind
        fixed = self._fixed_response(decision)
        revision = self._config.liara_corpus_revision
        assert revision is not None
        if fixed is not None:
            path = AnswerPath.CLARIFICATION if intent is IntentKind.CLARIFY else AnswerPath.ABSTENTION
            return PreparedGrounding(
                decision,
                path,
                (),
                None,
                fixed,
                revision,
                budget,
                planner_input_tokens,
                planner_output_tokens,
            )

        result = await self._index.search(query)
        candidates = [
            RetrievalCandidate(
                passage=item.passage,
                lexical_rank=index,
                semantic_rank=index,
                score=item.score,
            )
            for index, item in enumerate(result.candidates, start=1)
        ]
        token_limit = (
            self._config.complex_context_tokens if intent is IntentKind.COMPLEX else self._config.direct_context_tokens
        )
        selection: RetrievalSelection = select_passages(
            query=query,
            candidates=candidates,
            intent=intent,
            token_limit=token_limit,
            revision=revision,
            policy_version=self._config.retrieval_policy_version or "retrieval-v1",
        )
        if selection.decision.confidence_band in {ConfidenceBand.LOW, ConfidenceBand.CONFLICT}:
            abstention = (
                "در مستندات رسمی اطلاعات متعارض پیدا کردم؛ لطفاً سرویس یا نسخهٔ موردنظر را مشخص کنید."
                if selection.decision.confidence_band is ConfidenceBand.CONFLICT
                else SAFE_ABSTENTION
            )
            return PreparedGrounding(
                decision,
                AnswerPath.ABSTENTION,
                (),
                None,
                abstention,
                revision,
                budget,
                planner_input_tokens,
                planner_output_tokens,
            )
        passages = tuple(item.passage for item in selection.passages)
        prompt = build_grounded_prompt(
            caller_messages=[message.model_dump(mode="json") for message in request.messages],
            passages=passages,
            intent=intent,
        )
        return PreparedGrounding(
            decision,
            AnswerPath.GENERATED,
            passages,
            prompt,
            None,
            revision,
            budget,
            planner_input_tokens,
            planner_output_tokens,
        )

    @staticmethod
    def _latest_user_text(request: ProxyChatCompletionRequest) -> str:
        for message in reversed(request.messages):
            if message.role == "user" and isinstance(message.content, str) and message.content.strip():
                return message.content.strip()
        return ""

    @staticmethod
    def _previous_topic(request: ProxyChatCompletionRequest) -> str | None:
        latest_seen = False
        for message in reversed(request.messages):
            if message.role != "user" or not isinstance(message.content, str):
                continue
            if not latest_seen:
                latest_seen = True
                continue
            return IntentFeatures.from_text(message.content).topic
        return None

    @staticmethod
    def _fixed_response(decision: IntentDecision) -> str | None:
        if decision.kind is IntentKind.CLARIFY:
            if "error_context" in decision.missing_fields:
                return "این خطا مربوط به کدام سرویس لیارا است و متن یا نشانهٔ خطا چیست؟"
            return "برای راهنمایی دقیق، هدفتان از کار با کدام سرویس لیارا چیست؟"
        if decision.kind is IntentKind.OUT_OF_SCOPE:
            return (
                "این دستیار فقط دربارهٔ مستندات و سرویس‌های لیارا پاسخ می‌دهد؛ "
                "دربارهٔ استقرار و سرویس‌های لیارا راهنمایی می‌کنم."
            )
        if decision.kind is IntentKind.ELEVATED_RISK:
            return "به حساب یا منابع شما دسترسی ندارم و اقدامی انجام نمی‌دهم؛ می‌توانم مراحل امن مستندات را توضیح دهم."
        return None
