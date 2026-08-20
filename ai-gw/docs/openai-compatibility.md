# OpenAI compatibility

Set an OpenAI-compatible client base URL to `http(s)://<gateway>/v1`. The gateway is anonymous, so SDKs that require a client-side API key may receive any non-secret placeholder; it is never forwarded.

Supported operations:

- `GET /v1/models` returns exactly the configured public alias. It never queries Redis or the provider.
- `POST /v1/chat/completions` supports non-streaming JSON and raw SSE streaming.

Chat accepts system, developer, user, assistant, tool, and legacy function messages; function tools and tool results; inline data-image, audio, and file content; response formats; common generation controls; and provider-reported usage. Remote media URLs and provider file IDs are rejected. The gateway does not execute tools.

The request `model` must exactly match the listed alias. The gateway replaces it with the protected upstream model on dispatch and rewrites responses back to the public alias. Routing extras, alternate URLs/keys, fallbacks, retries, caches, provider selection, and unknown fields are rejected.

Streams contain ordered `data:` JSON events and exactly one `data: [DONE]`. Consume them as raw SSE; Swagger documents streaming but is primarily useful for non-streaming “Try it out.” Errors use the OpenAI-style `{"error": {"message", "type", "param", "code"}}` envelope and always contain bounded categories rather than provider details.

There is no message-history endpoint. Conversation messages are request input only and are not stored by the gateway.
