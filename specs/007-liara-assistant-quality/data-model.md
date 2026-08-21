# Data Model: Liara Assistant Quality

This feature does not introduce a transactional database or server-owned conversation history.
Entities are represented in the private retrieval index, strict browser state, content-free runtime
events, and versioned evaluation/deployment artifacts.

## 1. ApprovedDocumentationRevision

Represents the exact official snapshot eligible to support answers.

| Field                        | Type               | Rules                                                                     |
| ---------------------------- | ------------------ | ------------------------------------------------------------------------- |
| `revision`                   | string             | Stable opaque digest; lowercase hex, 64 characters                        |
| `upstream_revision`          | string             | Recorded Liara docs Git commit, never a moving branch                     |
| `schema_version`             | positive integer   | Manifest compatibility version                                            |
| `chunker_version`            | string             | Pinned deterministic algorithm/config version                             |
| `embedder_revision`          | string             | Protected operator value in runtime; hashed/public-safe value in evidence |
| `aggregate_checksum`         | string             | SHA-256 over sorted source path/content hashes                            |
| `page_count` / `chunk_count` | integer            | Positive and reconciled with the candidate index                          |
| `built_at`                   | RFC 3339 timestamp | Evidence only; excluded from deterministic revision digest                |
| `status`                     | enum               | `building`, `validating`, `active`, `superseded`, `failed`                |

State transitions:

```text
building -> validating -> active -> superseded
    |            |
    +----------> failed
```

Only one revision may be active for a deployment. Activation is atomic after checksum, URL/anchor,
count, schema, smoke-retrieval, and compatibility checks. A superseded compatible revision may be
reactivated for rollback. A missing, failed, or mismatched active revision makes readiness fail.

## 2. SourcePassage

A bounded unit of official evidence stored in the candidate/active retrieval index.

| Field                | Type             | Rules                                                                           |
| -------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `id`                 | string           | Deterministic digest from revision, path, heading/anchor, ordinal, content hash |
| `revision`           | string           | Must equal parent manifest revision                                             |
| `source_path`        | relative path    | Under the approved ingestion root; never returned publicly                      |
| `canonical_url`      | HTTPS URL        | Origin exactly `https://docs.liara.ir`; normalized path                         |
| `verified_anchor`    | string or null   | Must resolve in built route inventory; otherwise null                           |
| `title`              | string           | Non-empty, bounded                                                              |
| `heading_path`       | string array     | Ordered breadcrumb; bounded length/count                                        |
| `service_tags`       | string array     | Maintained allowlisted Liara taxonomy                                           |
| `language`           | enum             | `fa`, `en`, `mixed`, `unknown`                                                  |
| `content`            | string           | Original bounded Markdown section; never logged or sent as metadata             |
| `normalized_content` | string           | Search-only Unicode-normalized form                                             |
| `code_languages`     | string array     | Bounded detected code-fence languages                                           |
| `token_estimate`     | positive integer | Within chunk budget except approved indivisible block ceiling                   |
| `content_hash`       | string           | SHA-256 of original content                                                     |

Relationships: many passages belong to one revision; a retrieval selects passages; citations point
to selected passage IDs. Duplicate/near-duplicate selected passages are suppressed by content hash
and page/heading diversity.

## 3. IntentDecision and RetrievalDecision

Per-request ephemeral decisions; values are retained only as closed enums and counts in usage events.
All caller roles are inputs to this decision, but caller `system`/`developer` messages are normalized
as untrusted conversation data and cannot override the gateway-owned grounding policy.

### IntentDecision

| Field            | Type       | Rules                                                                      |
| ---------------- | ---------- | -------------------------------------------------------------------------- |
| `kind`           | enum       | `direct`, `complex`, `clarify`, `abstain`, `out_of_scope`, `elevated_risk` |
| `missing_fields` | enum array | Bounded service/runtime/version/environment/etc.; no user text             |
| `topic_changed`  | boolean    | Resets unconfirmed workflow/context assumptions                            |
| `reason_code`    | enum       | Closed content-free reason                                                 |
| `planner_used`   | boolean    | True only for an allowed low-confidence/complex route                      |

### RetrievalDecision

| Field                         | Type         | Rules                                             |
| ----------------------------- | ------------ | ------------------------------------------------- |
| `query_fingerprint`           | string       | HMAC; never raw query                             |
| `revision` / `policy_version` | string       | Required cache/trace scope                        |
| `candidate_count`             | integer      | Bounded by configured maximum                     |
| `selected_passage_ids`        | string array | 0–4 direct; 0–8 complex; within context token cap |
| `retrieval_tokens`            | integer      | Non-negative estimate                             |
| `confidence_band`             | enum         | `high`, `medium`, `low`, `conflict`               |
| `cache_outcome`               | enum         | `ineligible`, `miss`, `hit`, `stale`, `error`     |

Response state:

```text
validated -> classified -> retrieved -> generating -> paragraph_validating -> completed
                    |            |                 |                   |
                    +-> clarify  +-> abstain       +-> safe_abstain    +-> failed/stopped
```

No upstream generation occurs for deterministic out-of-scope or adequate fixed clarification paths
unless the calibrated policy explicitly requires it. Cancellation closes retrieval/upstream work and
reconciles the reservation once.

## 4. Citation and LiaraAssistantMetadata

### Citation

| Field                    | Type             | Rules                                          |
| ------------------------ | ---------------- | ---------------------------------------------- |
| `id`                     | string           | Unique within response, e.g. `c1`              |
| `marker`                 | positive integer | Display order and adjacent Markdown marker     |
| `passage_id`             | string           | Must be among selected passages                |
| `title`                  | string           | From index, never model-authored               |
| `url`                    | HTTPS URL        | Server-resolved approved canonical page/anchor |
| `heading`                | string or null   | From verified heading metadata                 |
| `documentation_revision` | string           | Must equal active revision                     |
| `validation`             | enum             | Public successful output uses only `valid`     |

The browser does not store raw passage text or internal relevance scores. Evaluation records may
join `passage_id` back to the approved index to assess entailment.

### LiaraAssistantMetadataV1

| Field                    | Type                  | Rules                                                      |
| ------------------------ | --------------------- | ---------------------------------------------------------- |
| `schema_version`         | constant `1`          | Additive public extension version                          |
| `documentation_revision` | string                | Public-safe revision digest                                |
| `intent`                 | IntentDecision subset | Kind, bounded missing fields, topic-change only            |
| `answer_path`            | enum                  | `generated`, `clarification`, `abstention`, `exact_cache`  |
| `citations`              | Citation array        | Maximum 12, unique IDs/markers, valid only                 |
| `next_steps`             | NextStep array        | Maximum 3, bounded label/prompt or approved URL            |
| `workflow`               | WorkflowState or null | Bounded and user-confirmable                               |
| `reuse`                  | enum                  | `none`, `retrieval`, `reviewed_exact_answer`; no cache key |

The object appears on non-stream completions and on exactly one terminal JSON SSE chunk before
`[DONE]`. It is absent from ordinary delta chunks. Unknown extension fields are rejected by the
Liara consumer schema but may be ignored by generic OpenAI consumers.

## 5. BrowserChatStateV2

Tab-scoped anonymous state persisted in `sessionStorage`.

| Field             | Type                    | Rules                                                         |
| ----------------- | ----------------------- | ------------------------------------------------------------- |
| `version`         | constant `2`            | v1 migrates deterministically; invalid state resets safely    |
| `model`           | string or null          | Discovered public alias only                                  |
| `messages`        | BrowserMessage array    | Strict turn pairing/order, IDs unique, bounded counts/content |
| `preferences`     | ConversationPreferences | Explicit values only; no identity                             |
| `active_workflow` | WorkflowState or null   | Bounded, current topic only                                   |
| `feedback`        | Feedback array          | Local enum records keyed to completed assistant IDs           |
| `updated_at`      | RFC 3339 timestamp      | Updated on stable state changes                               |

### BrowserMessage additions

Assistant messages may contain validated `metadata`; user messages never do. `streaming`, `stopped`,
and `failed` remain assistant-only. Restoring `streaming` normalizes it to `stopped`. Failed output is
excluded from outbound context; stopped content may be visible/context-eligible. Retry replaces only
the paired assistant. Context selection always includes the new user turn and applies configured
turn/token bounds to earlier relevant pairs.

### ConversationPreferences

- `language`: `auto`, `fa`, or `en`
- `experience`: `unknown`, `novice`, or `experienced`
- `service`: null or an allowlisted bounded service identifier
- `explicit`: the unique preference keys the visitor deliberately supplied; every non-default value
  must be listed

No preference is inferred from identity, IP, browser fingerprint, or server profile.

### WorkflowState

| Field            | Type           | Rules                                        |
| ---------------- | -------------- | -------------------------------------------- |
| `id` / `goal`    | string         | Bounded; tied to source turn                 |
| `steps`          | 1–10 steps     | Unique IDs and ordered positions             |
| `status`         | enum           | `pending`, `current`, `completed`, `blocked` |
| `verification`   | string or null | Bounded, safe check                          |
| `source_turn_id` | UUID           | Existing turn                                |
| `updated_at`     | timestamp      | Stable state transition                      |

A step becomes `completed` only through explicit user confirmation or a deterministic validated
outcome; the assistant cannot claim completion. Topic shift or new conversation clears the workflow.

### Feedback

Local-only record: completed assistant message ID, `helpful` or `unhelpful`, optional bounded reason
enum (`incorrect`, `missing_detail`, `bad_source`, `unclear`, `other`), and timestamp. There is no
free text. Central collection is deferred because no extra public feedback endpoint is needed for
the scorecard and an ad hoc telemetry endpoint would broaden privacy/public surface.

## 6. AnswerBudget and ReusableArtifact

### AnswerBudget

Per route, validated at startup:

- maximum selected passages and retrieval-context tokens
- maximum history turns/tokens
- maximum planner input/output and generation input/output tokens
- maximum request lifetime and time to first content
- maximum estimated cost micro-units
- shortening/rejection behavior when the reservation cannot fit

Every external call is reserved before dispatch and reconciled exactly once. `direct` starts at
2,500 retrieval-context/600 output tokens; `complex` at 6,000/1,200; clarification/abstention at 200
output. Calibrated configuration may only tighten or change these with evaluation evidence.

### ReusableArtifact

| Field                       | Type               | Rules                                                                  |
| --------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `kind`                      | enum               | `retrieval_result`, `reviewed_exact_answer`                            |
| `key`                       | HMAC digest        | Includes revision, policy/prompt version, route, locale; no raw input  |
| `value`                     | bounded object     | Passage IDs or citation-valid approved answer only                     |
| `eligibility`               | closed reason enum | Rejects history, personalization, secrets/IDs, risk, invalid citations |
| `created_at` / `expires_at` | timestamps         | Short bounded TTL; expiration mandatory                                |
| `revision`                  | string             | Namespace invalidates immediately on activation                        |

Semantic-equivalence caching and arbitrary conversation-answer caching are invalid states.

## 7. EvaluationCase and EvaluationReport

### EvaluationCase

Stable ID, dataset/schema version, split (`tuning`/`held_out`), approved documentation revision,
question and optional preceding turns, language, category, difficulty, expected intent/route, expected
source URLs/anchors, required facts/cautions, forbidden claims, expected clarify/abstain behavior,
security tags, rubric, and critical-failure conditions. Cases contain no credentials.

### EvaluationReport

Records run ID/time, Git SHA, image/model-policy/pipeline/corpus revisions, configuration digest,
case results, aggregate retrieval/quality/citation/intent/context/safety/a11y/latency/token/cost/cache
metrics, baseline comparison, gate decisions, reviewer identity/role, and immutable artifact checksums.
Model/provider identifiers remain in operator-private evidence and appear only as protected digests in
shareable reports.

Report transition: `running -> awaiting_human_review -> accepted | rejected`. A critical citation,
security, supported-framework, readiness, or deployment failure forces `rejected` regardless of
aggregate score.

## 8. UsageRecord and OperationalAlert

### UsageRecord

Content-free per-request event keyed by request ID: timestamp, deployment/pipeline/corpus digests,
intent/answer-path/outcome enums, candidate/selected counts, retrieval/context/planning/generation
token counts, cache outcome, TTFT/total/retrieval/upstream latency, charged tokens, integer estimated
cost micro-units, limit/budget outcome, and sanitized failure category. It MUST NOT contain user or
assistant text, passage excerpts, credentials, provider/model names, cache keys, or raw client IP.

### OperationalAlert

Rule ID, sanitized metric/expression, severity, threshold/window, owner, runbook link, first/last
observed time, state (`inactive`, `firing`, `acknowledged`, `resolved`), and resolution note without
conversation content. Every production rule has an owner and a tested runbook.

## 9. DeploymentEvidence

Repository URL, public docs/gateway URLs, Git SHA, image digests, public-safe corpus revision,
configuration-name inventory with owners (never values), dependency/release versions, acceptance
report checksums, operator/timestamps, prior release reference, rollback command reference and
outcome. State is `built -> staged -> accepted -> promoted` or `rolled_back`; public acceptance is
impossible while the Next.js support gate or any critical report gate fails.
