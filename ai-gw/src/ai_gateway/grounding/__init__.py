"""Bounded, stateless grounding primitives for the Liara assistant."""

from ai_gateway.grounding.index_client import IndexClient, IndexSearchResult, IndexUnavailable
from ai_gateway.grounding.models import (
    AnswerBudget,
    ApprovedDocumentationRevision,
    Citation,
    IntentDecision,
    RetrievalDecision,
    SourcePassage,
    UsageRecord,
)
from ai_gateway.grounding.retrieval import (
    RetrievalCandidate,
    RetrievalSelection,
    normalize_query,
    select_passages,
)

__all__ = [
    "AnswerBudget",
    "ApprovedDocumentationRevision",
    "Citation",
    "IntentDecision",
    "IndexClient",
    "IndexSearchResult",
    "IndexUnavailable",
    "RetrievalCandidate",
    "RetrievalDecision",
    "RetrievalSelection",
    "SourcePassage",
    "UsageRecord",
    "normalize_query",
    "select_passages",
]
