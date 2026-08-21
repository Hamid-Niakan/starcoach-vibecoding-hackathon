# Phase 0 Research: Liara Assistant Quality

## 1. Baseline assessment

**Decision**: Begin implementation with an evidence matrix using `implemented`, `partially
implemented`, `missing`, and `blocked`, then run the same cases before and after remediation.

**Rationale**: Existing gateway enforcement, streaming, error, and UI foundations do not prove
grounded answer quality. Separate baseline evidence prevents subjective score inflation and satisfies
FR-001 through FR-003.

**Current baseline**:

- Response quality: **missing** — no retrieval, approved revisions, citations, abstention policy, or
  answer evaluations.
- UI/UX: **partially implemented** — Persian chat, streaming, stop/retry, reload recovery, request
  IDs, and desktop/mobile projects exist; structured sources, technical renderers, feedback,
  examples, full keyboard/a11y proof, and runtime browser evidence do not.
- Agentic/personalization: **mostly missing** — browser history is resent, but there is no intent,
  clarify-versus-answer, bounded topical context, explicit preference, or workflow policy.
- Security/stability/monitoring: **partially implemented with a strong foundation** — atomic Redis
  limits, fail-closed readiness, destination locking, bounds, cancellation, redaction, IDs, and basic
  metrics exist; RAG injection controls, protected metrics, cost/retrieval signals, alerts, and live
  multi-instance evidence do not.
- Liara deployment: **missing/blocked** — Compose syntax exists, not Liara-native deployment or
  public evidence; Next.js 14 is a release blocker.
- Cost: **partially implemented** — token caps/counters exist; routing budgets, estimated cost,
  reuse, comparative quality/cost evidence, and alerts do not.

**Alternatives considered**: Treating existing files as proof was rejected because success criteria
require reproducible behavior and before/after measurements.

## 2. Runtime architecture and product boundary

**Decision**: Keep `ai-gw` as the only public backend and preserve `/v1/models` and
`/v1/chat/completions`. Add a bounded grounding subsystem behind the stable public alias. It consumes
only a versioned private index and manifest, not Liara application modules or runtime source paths.
Completion history remains caller-supplied and stateless; ZarinPal remains disconnected.

**Rationale**: This reuses the reviewed admission, identity, CORS, cancellation, error, streaming,
and observability boundary. A deterministic root ingestion tool separates product source conversion
from gateway runtime code, satisfying the no application-source import rule.

**Alternatives considered**: A second public RAG API duplicates admission; browser retrieval exposes
policy and credentials; provider-hosted file search weakens revision ownership and portability.

## 3. Approved corpus and deterministic ingestion

**Decision**: Use the 1,143 cleaned files under `apps/liara-docs/public/llms/**/*.md` as approved
input. Build heading-aware stable passages and a checksummed manifest, upload into a candidate
Meilisearch index, run integrity/retrieval smoke checks, then atomically swap it into the stable alias.

**Rationale**: The cleaned corpus is one-to-one with the imported page set and includes canonical
original links. The current live crawler uses deployed HTTP, random IDs, destructive recreation, and
no corpus revision, so it cannot reproduce or roll back a judged answer.

Chunking preserves headings, lists, tables, and code fences. Initial calibration uses 350–600 token
sections, 60–100 token overlap, and a 1,200-token ceiling for indivisible code. IDs derive from
revision, source path, verified anchor/heading, ordinal, and content hash. URL/anchor validation uses
the built route inventory; an unverifiable anchor falls back to the canonical page.

Meilisearch documents atomic index swapping, which supports activation and rollback without a
partially rebuilt live index: [swap indexes](https://www.meilisearch.com/docs/reference/api/indexes/swap-indexes).

**Alternatives considered**: Live crawling is not revision-controlled; generated indexes stay
gitignored rather than committed; a local-only vector database complicates replicas and activation.

## 4. Persian/English retrieval

**Decision**: Use one multilingual hybrid index with raw/normalized query forms, lexical and dense
ranking fusion, duplicate suppression, service filters, and bounded diversity. Benchmark
lexical-only, pinned BGE-M3, and a smaller multilingual encoder; deploy the least costly candidate
that passes held-out retrieval gates. Add no reranker unless measured improvement justifies it.

**Rationale**: Queries mix Arabic/Persian variants, ZWNJ, English identifiers, CLI commands, errors,
paths, and Finglish. Normalization must improve recall without destroying technical tokens. Start
near 20 candidates, then select at most four passages for direct or eight for complex routes within
token budgets. Thresholds and semantic weight are calibration outputs, not universal constants.

References: [Meilisearch language guidance](https://www.meilisearch.com/docs/resources/help/language),
[hybrid ranking](https://www.meilisearch.com/docs/capabilities/hybrid_search/advanced/custom_hybrid_ranking),
[BGE-M3](https://huggingface.co/BAAI/bge-m3), and
[multilingual MiniLM](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2).

**Alternatives considered**: Separate language indexes fragment mixed queries; fixed unmeasured
thresholds and default reranking add cost without evidence.

## 5. Intent, clarification, personalization, and workflow

**Decision**: Route each latest turn to `direct`, `complex`, `clarify`, `abstain`, `out_of_scope`, or
`elevated_risk`. Direct requests use deterministic retrieval without a planner call. One bounded
planning call using the same locked provider may be used only when ambiguity, Finglish, or weak
complex retrieval warrants it. Personalization uses only explicit current-tab language, experience,
service, and confirmed workflow state.

**Rationale**: This avoids unnecessary clarification and external calls while permitting one useful
question when service/runtime/version would materially change instructions. Multi-step answers
return prerequisites, ordered steps, cautions, verification, progress, and one next action. Topic
shifts reset unconfirmed assumptions. The assistant never claims account access or live action.

**Alternatives considered**: A planner on every turn increases cost; browser heuristics cannot
reliably decide ambiguity; server profiles violate anonymous statelessness.

## 6. Grounding, citation gating, and OpenAI compatibility

**Decision**: Give the model opaque selected source IDs and require `[[S1]]` markers. The gateway
resolves only selected IDs to allowlisted canonical `https://docs.liara.ir/` links. It buffers
bounded Markdown paragraphs so split markers can be resolved and a technical paragraph with an
unknown/missing required marker can be replaced by a safe abstention before emission. The terminal
chunk includes optional versioned `x_liara` metadata with documentation revision, intent, answer
path, citations, next steps/workflow, and public-safe reuse status. Generic OpenAI clients may ignore
the extension.

**Rationale**: Server resolution guarantees destination provenance; nearby Markdown markers serve
generic clients; structured metadata lets Liara validate sources and workflow without scraping model
prose. Semantic entailment remains an evaluation gate—a valid URL is not proof of support.

**Alternatives considered**: Model-authored links can be invented; Markdown alone cannot carry a
revision/state contract; JSON-only output breaks streaming; fully unbuffered output exposes invalid
markers, while full-answer buffering harms latency.

## 7. Prompt-injection and unsafe-action controls

**Decision**: Treat user text and retrieved pages as untrusted data. Delimit passages with immutable
IDs, state that evidence is never instruction, retrieve only approved index content, expose no tools
or side effects, resolve citations server-side, bound every stage, and evaluate adversarial passages,
fake markers, prompt extraction, destructive commands, and conflicting instructions.

Caller-supplied `system` and `developer` roles remain accepted for OpenAI request compatibility but
are serialized as untrusted conversation context inside the gateway-owned instruction envelope; they
never receive gateway/provider instruction privilege. Browser-generated preference/workflow context
is likewise advisory and cannot change source, destination, limit, cache, or safety policy.

**Rationale**: RAG does not itself prevent prompt injection. Consequence containment is required even
if the model follows malicious text. References: [OpenAI instruction hierarchy](https://openai.com/index/the-instruction-hierarchy/)
and [OWASP LLM01](https://genai.owasp.org/llmrisk/llm01-prompt-injection/).

**Alternatives considered**: Prompt wording alone is not a security boundary; arbitrary URL search
or tools would broaden consequences and are outside scope.

## 8. Conversation state and accessible UX

**Decision**: Migrate strict browser state v1 to v2. Keep `sessionStorage`; add only explicit
non-identifying preferences, validated citations/intent/next steps, bounded workflow, and local enum
feedback. Context includes the current question and a bounded relevant window of completed/stopped
turns, excludes failed/streaming output, and uses no silent external summarization request.

Render GFM tables/lists, safe links, explicit `<bdi dir="ltr">` or LTR wrappers for code, commands,
URLs, IDs, and technical spans, copy controls, sources, examples, and a confirmed new-conversation
action. Streaming content is not a live region; one pre-existing atomic status announces only start
and terminal outcomes. Auto-scroll only near the bottom; otherwise show a “new response” jump. Keep
focus at the initiating control and honor reduced motion.

**Rationale**: This keeps personalization explicit/temporary and prevents stale context. A tab opened
with an opener may initially copy `sessionStorage`, so new-tab links use `noopener`
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)). Markup-level bidi
isolation follows [W3C guidance](https://www.w3.org/International/articles/inline-bidi-markup/Overview.en.php).

**Alternatives considered**: Server history expands privacy; inherited RTL alone breaks mixed text;
token-level live announcements are unusable.

## 9. Model selection, budgets, and safe reuse

**Decision**: Evaluate provider/model candidates offline, then deploy one pinned protected
destination—the least costly candidate passing critical held-out gates. Complexity changes
retrieval/context/output budget, not the public alias. Initial caps are 2,500 context/600 output
tokens for direct, 6,000/1,200 for complex, and 200 output for clarify/abstain. Every hidden planning
call is included in reservation, reconciliation, and cost.

Redis reuse is limited to revision/policy-scoped exact retrieval and exact answers that are
single-turn, context-free, non-personalized, free of secret/identifier patterns, citation-valid, and
short-lived. Keys use an HMAC, never raw questions. Semantic caching is deferred. Cache loss falls
back to uncached work; enforcement loss still fails closed.

**Rationale**: One destination preserves provider secrecy. Exact reuse can satisfy the repeated
workload without cross-context equivalence errors. Pinned models plus evals improve consistency
([OpenAI compatibility guidance](https://platform.openai.com/docs/api-reference/backward-compatibility)).

**Alternatives considered**: Runtime multi-provider routing adds operational complexity; semantic
caching risks leakage and false equivalence; no cache cannot meet the repeated-workload target.

## 10. Evaluation strategy

**Decision**: Maintain at least 120 reviewed JSONL cases: 30 direct, 25 complex/multi-document, 20
troubleshooting, 15 ambiguity, 15 unanswerable/out-of-scope, 10 injection/security, and 5
destructive/live-state cases. At least half are Persian and at least 20 are multi-turn. Split tuning
and held-out cases.

Run corpus integrity, retrieval recall/MRR/nDCG, deterministic citation/forbidden-claim checks,
human 0–4 rubrics, optional pinned secondary model grading, adversarial/failure suites, and the same
quality/latency/cost report before and after. Retrieval gates: recall@8 ≥95% simple and ≥90% complex,
unanswerable false-positive answers ≤5%, 100% approved destinations, zero critical injection success.
Answer gates are SC-001 through SC-006.

**Rationale**: Deterministic checks catch contract errors; human review judges entailment/usefulness;
a model grader cannot override critical failures. The dataset remains provider-neutral. OpenAI's
[Evals](https://platform.openai.com/docs/api-reference/evals) and
[graders](https://platform.openai.com/docs/api-reference/graders) illustrate mixed evaluation layers.

**Alternatives considered**: Model grading alone is not authoritative; tuning/scoring the same cases
overstates quality; ad hoc demos cannot support comparison.

## 11. Monitoring, metrics protection, and alerts

**Decision**: Extend content-free request records with closed enums and measurements for intent,
answer path, corpus/pipeline revision digests, retrieval count/tokens/duration, cache outcome,
planning/generation tokens, TTFT, total latency, sanitized outcome, and integer estimated cost
micro-units from validated runtime coefficients. `/metrics` requires a separate strong bearer token
in production, has no CORS, and returns `no-store`; local unauthenticated use needs an explicit flag.

Add owner/runbook mappings for readiness down >2m, log drops, 5xx >5%/5m, timeout >2%/10m, TTFT
p95 >2s, completion SLO, limit/quota exhaustion, retrieval/cache anomaly, and daily cost at 80%/100%
of budget. No client, request, content, provider, or raw revision value becomes a metric label.

**Rationale**: Existing metrics do not operate or cost a RAG system; a public metrics endpoint leaks
operational detail; unbounded labels create privacy/cardinality risk.

## 12. Liara deployment and release evidence

**Decision**: Deploy docs and gateway as independent Liara Docker apps on a private network with
managed Redis and Meilisearch. Compose remains local validation, not the deployment mechanism. An
idempotent activation command validates the indexed manifest before readiness. Gateway readiness
requires compatible enforcement and active index; upstream reachability remains request-time. Docs
build embeds only `NEXT_PUBLIC_AI_GATEWAY_URL`.

The runbook deploys dependencies/gateway first, verifies models/chat/citations/limits/failures, then
docs and 390/1440 keyboard/axe acceptance. Rollback restores recorded prior releases and compatible
corpus/enforcement revisions. Evidence records repo/public URLs, Git SHA, image digests, corpus
revision, configuration names, results, operator, timestamps, and rollback outcome.

**Rationale**: Liara does not directly deploy multi-service Compose; independent health-gated apps
support zero-downtime rollback. Relevant checked Liara docs are `/paas/docker/how-tos/deploy-app/`,
`/paas/docker/how-tos/deploy-docker-compose/`, `/paas/details/envs/`,
`/paas/details/health-check/`, `/paas/details/zero-downtime-deployment/`,
`/references/cli/deploy-app/`, and `/references/cli/see-app-logs/`.

Public release stays blocked until feature 005 moves Next.js off unsupported 14.x. The official
[Next.js support policy](https://nextjs.org/support-policy) currently lists 15.x Maintenance LTS and
16.x Active LTS.

**Alternatives considered**: Compose is not a Liara production descriptor; ignoring the framework
support gate violates the constitution; evidence without revisions/digests cannot be reproduced.
