from __future__ import annotations

from collections.abc import AsyncIterator, Iterable

import httpx

from ai_gateway.proxy.enforcement._types import UsageReservation


class FakeLimiter:
    def __init__(self) -> None:
        self.reservations: list[tuple[str, int]] = []
        self.reconciliations: list[int | None] = []

    async def reserve(self, client_id: str, token_count: int) -> UsageReservation:
        self.reservations.append((client_id, token_count))
        return UsageReservation("00000000-0000-4000-8000-000000000001", token_count)

    async def reconcile(self, reservation: UsageReservation, actual_tokens: int | None = None) -> None:
        self.reconciliations.append(actual_tokens)


class ChunkStream(httpx.AsyncByteStream):
    def __init__(self, chunks: Iterable[bytes]) -> None:
        self.chunks = chunks

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for chunk in self.chunks:
            yield chunk


def completion_payload(model: str = "fixture-model") -> dict:
    return {
        "id": "chatcmpl-1",
        "object": "chat.completion",
        "created": 0,
        "model": model,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": "hello"}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 2, "completion_tokens": 2, "total_tokens": 4},
    }
