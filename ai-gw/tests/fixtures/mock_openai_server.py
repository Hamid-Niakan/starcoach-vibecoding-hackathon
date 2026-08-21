from __future__ import annotations

import os
import time
import uuid

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from .sse_payloads import MALFORMED_CHUNKS, SPLIT_CHUNKS, VALID_CHUNKS

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
    if payload.get("stream"):
        chunks = MALFORMED_CHUNKS if mode == "malformed" else SPLIT_CHUNKS if mode == "split" else VALID_CHUNKS
        return StreamingResponse(iter(chunks), media_type="text/event-stream")
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
