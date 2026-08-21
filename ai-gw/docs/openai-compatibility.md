# OpenAI compatibility

Set an OpenAI-compatible client base URL to `http(s)://<gateway>/v1`. The gateway is anonymous, so SDKs that require a client-side API key may receive any non-secret placeholder; it is never forwarded.

Supported operations:

- `GET /v1/models` returns exactly the configured public alias. It never queries Redis or the provider.
- `POST /v1/chat/completions` supports non-streaming JSON and raw SSE streaming.

Chat accepts system, developer, user, assistant, tool, and legacy function messages; function tools and tool results; inline data-image, audio, and file content; response formats; common generation controls; and provider-reported usage. Remote media URLs and provider file IDs are rejected. The gateway does not execute tools.

The request `model` must exactly match the listed alias. The gateway replaces it with the protected upstream model on dispatch and rewrites responses back to the public alias. Routing extras, alternate URLs/keys, fallbacks, retries, caches, provider selection, and unknown fields are rejected.

Streams contain ordered `data:` JSON events and exactly one `data: [DONE]` only after the gateway observes the first valid upstream terminal marker. The gateway closes the upstream response at that marker and never forwards duplicate or trailing events. Consume streams as raw SSE; Swagger documents streaming but is primarily useful for non-streaming “Try it out.”

Failures known before streaming headers are committed use the OpenAI-style `{"error": {"message", "type", "param", "code"}}` envelope. A timeout, malformed event, transport failure, or upstream EOF after streaming begins closes the public stream without `[DONE]`; clients must treat that missing marker as an incomplete response and offer retry. Both forms expose bounded categories and the gateway-generated `x-request-id`, never provider details.

Browser callers need no credential. Configured origins may send `content-type` and an optional non-secret `authorization` placeholder and may read `x-request-id`. OpenAI clients without an `Origin` header remain supported. CORS controls browser visibility; it is not authentication.

There is no message-history endpoint. Conversation messages are request input only and are not stored by the gateway.
