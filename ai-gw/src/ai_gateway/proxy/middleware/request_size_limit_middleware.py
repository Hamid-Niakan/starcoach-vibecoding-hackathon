from __future__ import annotations

from collections import deque

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from ai_gateway.proxy.errors import ProxyException


class RequestSizeLimitMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        max_body_bytes: int,
        max_header_bytes: int = 32_768,
        max_header_count: int = 128,
        max_json_depth: int = 32,
    ) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes
        self.max_header_bytes = max_header_bytes
        self.max_header_count = max_header_count
        self.max_json_depth = max_json_depth

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        raw_headers = scope.get("headers", [])
        if (
            len(raw_headers) > self.max_header_count
            or sum(len(key) + len(value) for key, value in raw_headers) > self.max_header_bytes
        ):
            await ProxyException.invalid_request("The request headers exceed their limit.").as_response()(
                scope, receive, send
            )
            return
        headers = {key.lower(): value for key, value in raw_headers}
        content_lengths = [value for key, value in raw_headers if key.lower() == b"content-length"]
        if len(content_lengths) > 1 or b"transfer-encoding" in headers:
            await ProxyException.invalid_request("The request framing is invalid.").as_response()(scope, receive, send)
            return
        encoding = headers.get(b"content-encoding", b"identity").strip().lower()
        if encoding not in {b"", b"identity"}:
            await ProxyException.unsupported_content_encoding().as_response()(scope, receive, send)
            return
        try:
            content_length = int(headers.get(b"content-length", b"0"))
        except ValueError:
            await ProxyException.invalid_request("The request framing is invalid.").as_response()(scope, receive, send)
            return
        if content_length < 0:
            await ProxyException.invalid_request("The request framing is invalid.").as_response()(scope, receive, send)
            return
        if content_length > self.max_body_bytes:
            await ProxyException.payload_too_large().as_response()(scope, receive, send)
            return

        if scope.get("path") == "/v1/chat/completions":
            content_type = headers.get(b"content-type", b"").split(b";", 1)[0].strip().lower()
            if content_type != b"application/json":
                await ProxyException.unsupported_media_type().as_response()(scope, receive, send)
                return

        if scope.get("method") not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return

        buffered: deque[Message] = deque()
        body = bytearray()
        received = 0
        while True:
            message = await receive()
            buffered.append(message)
            if message["type"] == "http.disconnect":
                break
            if message["type"] != "http.request":
                continue
            received += len(message.get("body", b""))
            body.extend(message.get("body", b""))
            if received > self.max_body_bytes:
                await ProxyException.payload_too_large().as_response()(scope, receive, send)
                return
            if not message.get("more_body", False):
                break

        if scope.get("path") == "/v1/chat/completions" and _json_depth_exceeded(body, self.max_json_depth):
            await ProxyException.invalid_request("The request JSON exceeds its nesting limit.").as_response()(
                scope, receive, send
            )
            return

        async def replay_receive() -> Message:
            return buffered.popleft() if buffered else await receive()

        await self.app(scope, replay_receive, send)


def _json_depth_exceeded(value: bytes | bytearray, maximum: int) -> bool:
    depth = 0
    in_string = False
    escaped = False
    for byte in value:
        if in_string:
            if escaped:
                escaped = False
            elif byte == 0x5C:
                escaped = True
            elif byte == 0x22:
                in_string = False
        elif byte == 0x22:
            in_string = True
        elif byte in {0x7B, 0x5B}:
            depth += 1
            if depth > maximum:
                return True
        elif byte in {0x7D, 0x5D}:
            depth = max(0, depth - 1)
    return False
