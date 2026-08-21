from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import quote

from pydantic import HttpUrl, TypeAdapter

from ai_gateway.grounding.models import Citation, CitationValidation, SourcePassage

_SOURCE_MARKER = re.compile(r"\[\[S([1-9][0-9]?)\]\]")
_MODEL_LINK = re.compile(r"(?:https?://|\[[^\]]+\]\([^)]*\))", re.IGNORECASE)
_PERSIAN_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
_HTTP_URL = TypeAdapter(HttpUrl)
SAFE_ABSTENTION = (
    "برای پاسخ دقیق به این پرسش، اطلاعات کافی و قابل استناد در نسخهٔ فعلی مستندات پیدا نکردم. "
    "لطفاً موضوع یا سرویس را دقیق‌تر مشخص کنید."
)


@dataclass(frozen=True, slots=True)
class ValidatedAnswer:
    content: str
    citations: tuple[Citation, ...]
    abstained: bool


def _citation(passage: SourcePassage, marker: int) -> Citation:
    url = str(passage.canonical_url)
    if passage.verified_anchor:
        url = f"{url}#{quote(passage.verified_anchor, safe='-_~')}"
    return Citation(
        id=f"c{marker}",
        marker=marker,
        passage_id=passage.id,
        title=passage.title,
        url=_HTTP_URL.validate_python(url),
        heading=passage.heading_path[-1] if passage.heading_path else None,
        documentation_revision=passage.revision,
        validation=CitationValidation.VALID,
    )


class CitationBuffer:
    def __init__(self, passages: tuple[SourcePassage, ...]) -> None:
        self._passages = passages
        self._buffer = ""
        self._emitted: list[str] = []
        self._citations: dict[int, Citation] = {}
        self._failed = False

    def feed(self, chunk: str) -> str:
        if self._failed or not chunk:
            return ""
        self._buffer += chunk
        emitted: list[str] = []
        while "\n\n" in self._buffer:
            paragraph, self._buffer = self._buffer.split("\n\n", 1)
            validated = self._validate_paragraph(paragraph)
            if validated is None:
                self._failed = True
                self._emitted.clear()
                return ""
            rendered = f"{validated}\n\n"
            emitted.append(rendered)
            self._emitted.append(rendered)
        return "".join(emitted)

    def finish(self) -> ValidatedAnswer:
        if not self._failed and self._buffer.strip():
            validated = self._validate_paragraph(self._buffer)
            if validated is None:
                self._failed = True
            else:
                self._emitted.append(validated)
        if self._failed or not self._emitted:
            return ValidatedAnswer(SAFE_ABSTENTION, (), True)
        return ValidatedAnswer(
            "".join(self._emitted).rstrip(),
            tuple(self._citations[key] for key in sorted(self._citations)),
            False,
        )

    def _validate_paragraph(self, paragraph: str) -> str | None:
        if not paragraph.strip():
            return paragraph
        if _MODEL_LINK.search(paragraph):
            return None
        markers = list(_SOURCE_MARKER.finditer(paragraph))
        if not markers:
            return None
        for match in markers:
            marker = int(match.group(1))
            if marker > len(self._passages):
                return None
            self._citations.setdefault(marker, _citation(self._passages[marker - 1], marker))

        def replace(match: re.Match[str]) -> str:
            marker = int(match.group(1))
            citation = self._citations[marker]
            display = str(marker).translate(_PERSIAN_DIGITS)
            return f"[{display}]({citation.url})"

        return _SOURCE_MARKER.sub(replace, paragraph)


def validate_grounded_answer(text: str, passages: tuple[SourcePassage, ...]) -> ValidatedAnswer:
    buffer = CitationBuffer(passages)
    buffer.feed(text)
    return buffer.finish()
