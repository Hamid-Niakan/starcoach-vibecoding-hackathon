from __future__ import annotations

import asyncio
import os
import time
import uuid

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from .sse_payloads import (
    MALFORMED_AFTER_VALID_CHUNKS,
    MALFORMED_CHUNKS,
    MISSING_DONE_CHUNKS,
    SPLIT_CHUNKS,
    VALID_CHUNKS,
)

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
REQUESTS: list[dict] = []


@app.post("/v1/chat/completions")
async def chat_completions(payload: dict, authorization: str | None = Header(default=None)):
    expected = os.getenv("MOCK_UPSTREAM_API_KEY", "fixture-secret-not-for-production")
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="bad fixture credential")
    REQUESTS.append(payload)
    mode = payload.get("fixture_mode")
    if mode == "error":
        return JSONResponse({"error": {"message": "fixture failure", "type": "upstream_error"}}, status_code=500)
    if mode == "slow":
        await asyncio.sleep(0.25)
    if payload.get("stream"):
        chunks = {
            "malformed": MALFORMED_CHUNKS,
            "malformed_midstream": MALFORMED_AFTER_VALID_CHUNKS,
            "missing_done": MISSING_DONE_CHUNKS,
            "split": SPLIT_CHUNKS,
        }.get(mode, VALID_CHUNKS)

        async def fixture_stream():  # type: ignore[no-untyped-def]
            for chunk in chunks:
                if mode == "trickle":
                    await asyncio.sleep(0.1)
                yield chunk

        return StreamingResponse(fixture_stream(), media_type="text/event-stream")
    model = payload.get("model", "fixture-model")
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {"index": 0, "message": {"role": "assistant", "content": "fixture hello"}, "finish_reason": "stop"}
        ],
        "usage": {"prompt_tokens": 2, "completion_tokens": 2, "total_tokens": 4},
    }
