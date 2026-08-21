from __future__ import annotations

from ai_gateway.grounding.citations import CitationBuffer, validate_grounded_answer
from ai_gateway.grounding.models import CitationValidation, SourcePassage

REVISION = "a" * 64


def passage(key: str, *, anchor: str | None = "deploy") -> SourcePassage:
    return SourcePassage(
        id=key * 16,
        revision=REVISION,
        source_path=f"paas/{key}.md",
        canonical_url=f"https://docs.liara.ir/paas/{key}/",
        verified_anchor=anchor,
        title=f"Official {key}",
        heading_path=("Deploy",),
        service_tags=("paas",),
        language="mixed",
        content="official source",
        normalized_content="official source",
        code_languages=(),
        token_estimate=20,
        content_hash=key * 64,
    )


def test_resolves_selected_source_markers_to_adjacent_official_links() -> None:
    answer = validate_grounded_answer(
        "برای استقرار از دستور زیر استفاده کنید [[S1]].\n\nسپس سلامت را بررسی کنید [[S2]].",
        (passage("a"), passage("b", anchor=None)),
    )
    assert answer.abstained is False
    assert "[۱](https://docs.liara.ir/paas/a/#deploy)" in answer.content
    assert "[۲](https://docs.liara.ir/paas/b/)" in answer.content
    assert [citation.passage_id for citation in answer.citations] == ["a" * 16, "b" * 16]
    assert all(citation.validation is CitationValidation.VALID for citation in answer.citations)


def test_buffers_split_markers_and_emits_only_complete_validated_paragraphs() -> None:
    buffer = CitationBuffer((passage("a"),))
    assert buffer.feed("پاسخ مستند [[S") == ""
    assert "[۱](https://docs.liara.ir/paas/a/#deploy)" in buffer.feed("1]].\n\n")
    completed = buffer.finish()
    assert completed.abstained is False
    assert len(completed.citations) == 1


def test_unknown_marker_arbitrary_link_or_missing_support_yields_safe_abstention() -> None:
    for unsafe in (
        "این ادعا درست است [[S9]].",
        "این ادعا بدون منبع است.",
        "[راهنما](https://evil.example/) [[S1]].",
    ):
        result = validate_grounded_answer(unsafe, (passage("a"),))
        assert result.abstained is True
        assert result.citations == ()
        assert "اطلاعات کافی" in result.content


def test_duplicate_source_markers_reuse_one_citation_identity() -> None:
    result = validate_grounded_answer("ادعای اول [[S1]].\n\nادعای دوم [[S1]].", (passage("a"),))
    assert len(result.citations) == 1
    assert result.content.count("[۱](") == 2
