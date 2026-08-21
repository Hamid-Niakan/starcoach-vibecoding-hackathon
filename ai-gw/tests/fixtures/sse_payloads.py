from __future__ import annotations

VALID_CHUNKS = (
    b'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":0,'
    b'"model":"fixture-model","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}\n\n',
    b'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":0,'
    b'"model":"fixture-model","choices":[],"usage":{"prompt_tokens":2,'
    b'"completion_tokens":1,"total_tokens":3}}\n\n',
    b"data: [DONE]\n\n",
)
SPLIT_CHUNKS = (VALID_CHUNKS[0][:17], VALID_CHUNKS[0][17:], *VALID_CHUNKS[1:])
MALFORMED_CHUNKS = (b"data: {not-json}\n\n",)
MISSING_DONE_CHUNKS = VALID_CHUNKS[:-1]
MALFORMED_AFTER_VALID_CHUNKS = (VALID_CHUNKS[0], b"data: {not-json}\n\n")
OVERSIZED_EVENT = b"data: " + (b"x" * 1_100_000) + b"\n\n"
