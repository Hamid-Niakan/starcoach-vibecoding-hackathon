# Phase 1 Data Model: Integrate AI Gateway

This feature has no transactional application database. The model spans public protocol values,
per-tab browser state, and expiring Redis enforcement state.

## 1. Public Model

Represents the only client-visible model choice.

| Field      | Type                 | Rules                                                                                                   |
| ---------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| `id`       | string               | 1–128 characters; equals configured public alias; never equals or exposes protected upstream identifier |
| `object`   | literal `model`      | OpenAI-compatible discriminator                                                                         |
| `created`  | literal `0`          | Static compatibility value                                                                              |
| `owned_by` | literal `ai-gateway` | Does not identify the upstream provider                                                                 |

Relationships:

- Exactly one Public Model appears in a Model List.
- Every Chat Completion Request references its `id`.
- Every completion response/chunk rewrites `model` to its `id`.

## 2. Model List

| Field    | Type                  | Rules                                                                                                    |
| -------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| `object` | literal `list`        | Required                                                                                                 |
| `data`   | array of Public Model | Exactly one item at the gateway boundary; the browser still rejects zero or multiple results defensively |

Browser state transition:

```text
undiscovered -> discovering -> ready
                         \-> configuration_error
```

The successful alias is cached only in the current tab's versioned session state.

## 3. Browser Message

| Field       | Type                                             | Rules                                                                                         |
| ----------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `id`        | UUID string                                      | Generated in the browser; unique within the conversation                                      |
| `turnId`    | UUID string                                      | Shared by one user message and its assistant result; used for replacement                     |
| `role`      | `user` or `assistant`                            | Only roles emitted by the current UI                                                          |
| `content`   | string                                           | User content is trimmed and non-empty; assistant content may begin empty only while streaming |
| `status`    | `completed`, `streaming`, `stopped`, or `failed` | `user` messages are always completed                                                          |
| `createdAt` | RFC 3339 timestamp                               | Browser display ordering tie-breaker                                                          |
| `requestId` | string or absent                                 | Support correlation only; never an identity or credential                                     |
| `errorCode` | bounded gateway/UI code or absent                | Present only for failed assistant turns                                                       |

Validation:

- At most one message may be `streaming`.
- Messages form ordered turns: one completed user message followed by at most one assistant
  message with the same `turnId`.
- A `stopped` assistant message retains any received content.
- A failed assistant message is not sent as conversational context.
- A stopped or completed assistant message is sent as an OpenAI assistant message in follow-ups.
- Active abort handles and partial decoder buffers are runtime-only and never persisted.
- A persisted `streaming` assistant is normalized to `stopped` during restoration because its
  network request no longer exists.

Assistant lifecycle:

```text
streaming -> completed
          -> stopped -> streaming (retry replacement) -> completed/stopped/failed
          -> failed  -> streaming (retry replacement) -> completed/stopped/failed
```

Retry removes the old assistant result for the selected `turnId` and creates one replacement with
that `turnId`; it does not duplicate the paired user message.

## 4. Browser Conversation State

| Field       | Type                          | Rules                                                             |
| ----------- | ----------------------------- | ----------------------------------------------------------------- |
| `version`   | literal `1`                   | Unsupported versions are discarded                                |
| `model`     | Public Model `id` or null     | Populated after successful discovery                              |
| `messages`  | ordered Browser Message array | Structurally validated before restoration                         |
| `updatedAt` | RFC 3339 timestamp            | Informational; not used for authentication or conflict resolution |

Ownership and lifetime:

- One state object per browser tab under a Liara-specific `sessionStorage` key.
- Reload in the same tab restores valid version-1 state.
- Closing the tab ends the browser-managed lifetime. An independent tab opened without an opener
  starts empty; tests do not assume browsers will avoid cloning session storage into opener-created
  tabs.
- Invalid JSON, legacy credentials, legacy conversation IDs/tokens, or unknown versions are removed.
- The gateway never receives browser message IDs, statuses, or timestamps; it receives ordered
  `{role, content}` context only.

## 5. Chat Completion Request

Liara uses the following subset of the gateway's broader OpenAI-compatible request model.

| Field                   | Type                       | Rules                                                                |
| ----------------------- | -------------------------- | -------------------------------------------------------------------- |
| `model`                 | string                     | Equals the single discovered Public Model `id`                       |
| `messages`              | ordered array              | One or more system/user/assistant messages; bounded by gateway limit |
| `stream`                | literal `true`             | Liara user flow always streams                                       |
| `max_completion_tokens` | positive integer or absent | Cannot exceed configured gateway cap                                 |

The gateway validates the full request, replaces the public model with the protected upstream
model, and never persists messages.

Request lifetime begins before admission and ends only after response close and reservation
reconciliation. Non-streaming requests have an absolute `max_request_seconds` deadline; streaming
requests have an absolute `max_stream_seconds` deadline. Receiving bytes does not reset either
deadline. Expiry before response headers yields a sanitized 504; expiry after streaming begins
closes upstream and the public stream without `[DONE]`, after which the browser reports an
incomplete stream.

## 6. Chat Completion Chunk

| Field     | Type                            | Rules                                                                      |
| --------- | ------------------------------- | -------------------------------------------------------------------------- |
| `id`      | string                          | Stable provider completion identifier after sanitization                   |
| `object`  | literal `chat.completion.chunk` | Required discriminator                                                     |
| `created` | integer                         | Provider-compatible timestamp                                              |
| `model`   | Public Model `id`               | Protected model is rewritten                                               |
| `choices` | array                           | Liara consumes ordered `delta.content` text and finish reason              |
| `usage`   | object or absent                | If present, non-negative prompt/completion/total values with a valid total |

Stream invariants:

- JSON may be split across transport chunks but not across completed SSE events; LF and CRLF event
  boundaries and comment lines are accepted.
- Each parsed data event is validated before UI mutation.
- The browser caps one SSE event at 256 KiB, its undecoded buffer at 512 KiB, the entire stream at
  64 MiB/100,000 events, and accumulated assistant text at 1 MiB.
- The first `data: [DONE]` terminates a successful public stream and causes the reader to close
  immediately; gateway producer tests enforce that no second public marker is emitted.
- EOF without `[DONE]`, oversized data, malformed JSON, or invalid chunks produce a bounded client
  protocol error. Duplicate or post-terminal upstream events are normalized or rejected by the
  gateway and are not observable browser states.

## 7. OpenAI Error

| Field               | Type                    | Rules                                            |
| ------------------- | ----------------------- | ------------------------------------------------ |
| `error.message`     | string                  | Human-safe and at most 512 characters            |
| `error.type`        | string                  | Bounded category                                 |
| `error.param`       | string or null          | Public request field only                        |
| `error.code`        | string                  | Stable public error code                         |
| response request ID | header/string or absent | Retained for support display; contains no secret |

Liara maps error codes/statuses into Persian recovery groups: invalid input/model, rate/quota,
gateway not ready, timeout, upstream unavailable/malformed, incomplete stream, and unknown safe
failure. Before streaming starts, the body uses the OpenAI error envelope. After HTTP 200 streaming
headers, failure is represented by termination without `[DONE]` and correlated with the response
request ID. Raw response bodies, stack traces, provider URLs, protected models, and keys are never
rendered.

## 8. Anonymous Usage Identity

| Field                    | Type                       | Rules                                                       |
| ------------------------ | -------------------------- | ----------------------------------------------------------- |
| canonical client address | runtime-only network value | Resolved using trusted-proxy policy; never logged or stored |
| identity secret          | server secret              | At least 32 bytes; runtime configuration only               |
| `client_id`              | HMAC-SHA-256 digest        | Non-reversible enforcement key component                    |

One identity relates to multiple expiring Usage Reservations and counters. It has no user profile,
message history, or durable index.

## 9. Usage Reservation

| Field                | Type                                 | Rules                                                  |
| -------------------- | ------------------------------------ | ------------------------------------------------------ |
| reservation ID       | UUID                                 | Idempotency boundary                                   |
| client ID            | Anonymous Usage Identity digest      | Never raw IP                                           |
| reserved tokens      | positive integer                     | Worst-case bounded charge at admission                 |
| lease expiry         | Redis-time deadline                  | Stream maximum plus reconciliation grace               |
| final charged tokens | integer or conservative reservation  | Provider usage when trustworthy, otherwise reservation |
| state                | `active`, `reconciled`, or `expired` | Reconciliation releases concurrency exactly once       |

Admission atomically evaluates client/global RPM, TPM, quota, and concurrency. Redis ambiguity or
unavailability rejects admission without upstream dispatch.

## 10. Gateway Readiness State

| Input                   | Ready condition                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| immutable configuration | fully valid at startup; invalid configuration prevents process start before readiness exists |
| Redis connectivity      | reachable within configured timeout                                                          |
| enforcement marker      | exists and equals current policy fingerprint                                                 |
| Lua scripts             | both loaded in Redis                                                                         |
| inconsistency marker    | absent                                                                                       |
| upstream provider       | deliberately excluded from readiness                                                         |

States:

```text
starting -> ready <-> not_ready -> stopping
invalid configuration -> startup_failed
```

An upstream failure does not transition readiness; it produces a sanitized error for the affected
completion request.
