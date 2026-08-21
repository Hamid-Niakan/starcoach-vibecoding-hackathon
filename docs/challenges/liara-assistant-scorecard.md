# Liara Assistant Quality Scorecard

**Feature**: `007-liara-assistant-quality`  
**Baseline date**: 2026-08-21  
**Baseline revision**: `b2fd05a1ec2789234303ddbcda78ef6cbc105a94`  
**Baseline report SHA-256**: `0c3213931a38c6f1790bf1eb3599bdbe840071da4e1495bdb32e34ef2d143dce`  
**Allowed states**: `implemented`, `partially implemented`, `missing`, `blocked`

This is an evidence index, not a self-awarded score. A row moves to `implemented` only when its
validation command passes and the linked evidence is inspectable. Baseline and final runs use the
same versioned cases and report schema.

## Baseline summary

| Area                                     | Points | Baseline state        | Current evidence                                                                                                                                                                     |
| ---------------------------------------- | -----: | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Response quality and accuracy            |     80 | missing               | The current gateway is a secure model proxy with no approved corpus, retrieval, citations, abstention policy, or fixed quality report.                                               |
| UI design and user experience            |     55 | partially implemented | Persian chat, streaming, cancellation, retry, session reload, request IDs, and responsive projects exist; grounded-source and complete accessibility evidence does not.              |
| Agentic capabilities and personalization |     50 | missing               | History is resent, but there is no intent, clarification, explicit preference, topic, workflow, or safe-action policy.                                                               |
| Security, stability, and monitoring      |     50 | partially implemented | Redis admission, limits, redaction, deadlines, request IDs, and basic metrics exist; retrieval security, protected metrics, RAG failure evidence, alerts, and cost telemetry do not. |
| Deployment on Liara infrastructure       |     40 | blocked               | Compose definitions are not Liara deployment evidence, feature-006 live evidence is incomplete, and unsupported Next.js 14 blocks release.                                           |
| Cost optimization                        |     25 | partially implemented | Token caps and usage counters exist; route budgets, price coefficients, safe reuse, and quality/cost comparison do not.                                                              |

## Criterion evidence matrix

| Criterion                               | Baseline    | Required remediation                                                  | Acceptance/evidence                                                                    |
| --------------------------------------- | ----------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Accurate and relevant simple answers    | missing     | Approved revision retrieval and grounding                             | `pnpm liara:eval:answers --mode live --split held_out`; ≥90% simple acceptable/correct |
| Complete and useful complex answers     | missing     | Multi-document retrieval and structured answer policy                 | Same held-out report; ≥85% complex acceptable/correct                                  |
| Finds appropriate information           | missing     | Calibrated Persian/English hybrid retrieval                           | `pnpm liara:eval:retrieval --split held_out`; recall@8 ≥95% simple and ≥90% complex    |
| Minimizes hallucinations                | missing     | Evidence thresholds, conflict handling, safe abstention               | Unanswerable safe behavior ≥95%; zero critical invented facts                          |
| Suitable adjacent official sources      | missing     | Stable passage IDs and server-resolved citations                      | Adjacent supported claims ≥95%; destination validity 100%                              |
| Troubleshooting and multi-step depth    | missing     | Prerequisite/action/caution/verification templates                    | ≥90% cases contain required structure without critical omission                        |
| Discoverable Persian onboarding         | partial     | Examples, state copy, new-chat action                                 | Component and both-viewport Playwright evidence                                        |
| Smooth continuing conversation          | partial     | Bounded context, metadata persistence, recovery states                | Follow-up/stop/retry/reload/offline browser journeys                                   |
| Code, links, tables, and technical text | partial     | Safe GFM, copy controls, bidi isolation, overflow handling            | Component tests plus 390px/1440px no-overflow checks                                   |
| Responsive design                       | partial     | Safe-area composer and target sizing                                  | Desktop/mobile Playwright screenshots and assertions                                   |
| Accessibility and UX details            | partial     | Terminal-only live status, deterministic focus/scroll, reduced motion | Zero serious/critical axe findings and keyboard-complete journeys                      |
| Understands intent                      | missing     | Bounded route classification                                          | ≥90% approved intent decisions                                                         |
| Asks necessary follow-up questions      | missing     | Material-missing-field clarification policy                           | Correct ambiguous decisions ≥90%; unnecessary clarification <10%                       |
| Maintains relevant context              | partial     | Relevant bounded history and topic reset                              | ≥90% continuing cases retain only valid relevant context                               |
| Personalizes explicitly                 | missing     | Per-tab language/experience/service controls                          | Preference cases pass without inferred identity/state                                  |
| Suggests next steps                     | missing     | Validated prompt/URL next-step metadata                               | Agentic cases contain one practical supported next action                              |
| Handles multi-step workflows            | missing     | User-confirmed bounded workflow state                                 | Workflow transition and browser tests pass                                             |
| Safe account/action boundaries          | missing     | Elevated-risk/out-of-scope policy                                     | Zero false account inspection, mutation, deployment, or live-state claims              |
| Rate, quota, token, concurrency limits  | implemented | Preserve and exercise with grounding hidden calls                     | Redis multi-instance/performance suite; 100% boundary rejection                        |
| Secret and provider management          | partial     | Add retrieval/cache/metrics secrets and scans                         | Zero canaries in tracked files, bundles, errors, logs, metrics, traces, artifacts      |
| Failure-condition management            | partial     | Index/cache/retrieval failures and paragraph cleanup                  | Failure-injection matrix and request-ID correlation ≥99%                               |
| Token/request control                   | partial     | Per-route retrieval/history/planner/output/cost budgets               | 100% accepted work within budget or safely shortened/rejected                          |
| Logging and monitoring                  | partial     | RAG/TTFT/cache/cost metrics and protected scrape                      | Metrics/auth/label tests and alert rules pass                                          |
| Scalable maintainable architecture      | partial     | Stateless replicas, private index, atomic activation/rollback         | Multi-instance, boundary, image, and architecture checks pass                          |
| Liara execution                         | blocked     | Independent gateway/docs apps plus private Redis/Meilisearch          | Public/staging URLs, healthy revision, and staging report                              |
| Deployment process quality              | blocked     | Clean-clone runbook and health-gated ordering                         | Teammate completes staging and rollback in <30 minutes                                 |
| Appropriate configuration               | partial     | Names/owners, no values, ingress/CORS/readiness policy                | Deployment config tests and evidence schema pass                                       |
| Production readiness                    | blocked     | Supported Next.js, critical gates, alerts/runbooks                    | `pnpm release:check` and all critical report gates pass                                |
| Appropriate model/service choice        | missing     | Held-out candidate comparison and protected pinned selection          | Public-safe model-selection report chooses least-cost passing policy                   |
| Token usage control                     | partial     | Route budgets and hidden-call accounting                              | Budget tests and per-route usage evidence pass                                         |
| Reduces unnecessary requests            | missing     | Direct path without planner and exact retrieval reuse                 | Route/planner and cache metrics demonstrate avoided work                               |
| Uses caching safely                     | missing     | HMAC exact retrieval/reviewed-answer cache                            | Eligibility/privacy/invalidation/TTL/capacity tests pass                               |
| Infrastructure cost consideration       | missing     | Integer cost coefficients and daily thresholds                        | Cost report plus 80%/100% alerts and operator policy                                   |
| Quality/cost balance                    | missing     | Fixed uncached/cached workload comparison                             | ≥25% cost reduction, ≤2-point quality regression, no critical safety regression        |

## Evidence locations

- Frozen baseline: `.artifacts/liara/baseline/report.json`
- Story reports: `.artifacts/liara/us1/` through `.artifacts/liara/us6/`
- Staging and rollback: `.artifacts/liara/staging/evidence.json`
- Final reproducibility, containers, redaction, and aggregate report: `.artifacts/liara/final/`
- Feature completion record: `specs/007-liara-assistant-quality/validation.md`

External credentials, provider/model identifiers, message bodies outside reviewed cases, retrieved
passages, client addresses, and cache keys are forbidden in shareable evidence.

## Functional-requirement reconciliation

`implemented` below means the specified behavior has passing local automated evidence. `partial`
means implementation exists but a required live/manual/held-out gate is still absent. `blocked`
means acceptance requires the explicitly named external or human gate.

| Requirement | State       | Evidence or remaining gate                                                                    |
| ----------- | ----------- | --------------------------------------------------------------------------------------------- |
| FR-001      | implemented | Frozen baseline report and this 300-point matrix.                                             |
| FR-002      | implemented | Every baseline gap maps to feature tasks and an acceptance command.                           |
| FR-003      | partial     | Baseline is frozen; accepted same-case final/human run is deferred.                           |
| FR-004      | implemented | Revision-pinned corpus manifest, readiness compatibility, and grounding tests.                |
| FR-005      | partial     | Multilingual bounded ranking is implemented; held-out hybrid acceptance is deferred.          |
| FR-006      | implemented | Server-owned citation markers, official-origin validation, and adjacency tests.               |
| FR-007      | partial     | Direct/complex structure is implemented; human usefulness grading is deferred.                |
| FR-008      | implemented | Low/conflicting evidence clarification and abstention tests pass.                             |
| FR-009      | blocked     | 120 cases exist, but documentation/quality-owner review is deferred.                          |
| FR-010      | implemented | Versioned evaluation-case/report schemas and deterministic I/O tests.                         |
| FR-011      | implemented | Persian onboarding, examples, entry points, and new-chat controls.                            |
| FR-012      | implemented | Safe GFM, code copy, tables, links, citations, and bidi component tests.                      |
| FR-013      | partial     | Deterministic state/component coverage passes; live two-viewport run is deferred.             |
| FR-014      | implemented | State-v2 migration, stable persistence, bounded context, retry pairing tests.                 |
| FR-015      | partial     | Semantic/focus/axe automation exists; manual assistive review is deferred.                    |
| FR-016      | implemented | Sources, request IDs, and enum-only local feedback are exposed.                               |
| FR-017      | implemented | Closed deterministic intent routes and optional bounded planner tests.                        |
| FR-018      | implemented | Material-missing-field clarification policy tests.                                            |
| FR-019      | implemented | Explicit-only language, experience, and service preferences.                                  |
| FR-020      | implemented | Relevant bounded history, topic reset, and failed/streaming exclusion tests.                  |
| FR-021      | implemented | Bounded workflow, verification, and next-step UI/state tests.                                 |
| FR-022      | implemented | Elevated-risk/out-of-scope and no-action/no-account boundaries.                               |
| FR-023      | blocked     | Versioned automatic cases exist; accepted independent agentic review is deferred.             |
| FR-024      | partial     | Atomic limits and hidden-call budget code pass locally; live multi-instance gate is deferred. |
| FR-025      | implemented | Secret/config ownership, redaction canaries, and protected identity tests.                    |
| FR-026      | partial     | Failure, deadline, cancellation, and cleanup tests pass; full dependency matrix is deferred.  |
| FR-027      | implemented | Planner eligibility, context/output caps, and exact HMAC reuse policy.                        |
| FR-028      | implemented | Content-free route/retrieval/cache/token/TTFT/cost metrics and events.                        |
| FR-029      | implemented | Threshold rules, owners, and linked recovery runbook tests.                                   |
| FR-030      | partial     | Redis/index fail-closed readiness is implemented; live recovery proof is deferred.            |
| FR-031      | partial     | Stateless/private dependency design and cancellation exist; scaling proof is deferred.        |
| FR-032      | implemented | Release gate rejects unsupported Next.js and missing critical evidence.                       |
| FR-033      | implemented | Clean-clone Liara provisioning/config/DNS/CORS/promotion/rollback runbook.                    |
| FR-034      | blocked     | Staging parity requires Liara credentials and accepted upstream configuration.                |
| FR-035      | blocked     | Public desktop/mobile/manual acceptance is deferred.                                          |
| FR-036      | blocked     | Repository/public URLs, image digests, operator, and rollback evidence require staging.       |
| FR-037      | implemented | Route token/cost budgets, daily aggregate limits, and observability.                          |
| FR-038      | partial     | Least-cost passing selector exists; protected live candidate benchmark is deferred.           |
| FR-039      | implemented | Revision/policy-scoped retrieval and reviewed-answer cache with safe fallback.                |
| FR-040      | partial     | Correlated quality/cost regression gate exists; accepted workload run is deferred.            |
| FR-041      | implemented | Bounded route/cache/cost outcomes and operator cost policy.                                   |

## Success-criterion reconciliation

| Criterion | State       | Evidence or remaining gate                                                              |
| --------- | ----------- | --------------------------------------------------------------------------------------- |
| SC-001    | blocked     | Requires accepted held-out simple/complex human grading.                                |
| SC-002    | blocked     | Automated citation validation passes; ≥95% held-out claim review is deferred.           |
| SC-003    | blocked     | Abstention tests pass; accepted unanswerable-case run is deferred.                      |
| SC-004    | blocked     | Workflow structure exists; ≥90% reviewed troubleshooting run is deferred.               |
| SC-005    | blocked     | Route cases pass locally; independent ≥90% decision review is deferred.                 |
| SC-006    | blocked     | Context tests pass locally; accepted continuing-case run is deferred.                   |
| SC-007    | blocked     | Streaming instrumentation exists; live TTFT/latency run is deferred.                    |
| SC-008    | blocked     | Both Playwright projects enumerate; runtime journeys/manual checks are deferred.        |
| SC-009    | partial     | Component axe checks pass; full live state matrix/manual AT review is deferred.         |
| SC-010    | partial     | Limit/budget tests pass; real Redis multi-replica boundary proof is deferred.           |
| SC-011    | partial     | Local canary/redaction report passes; live logs/traces/staging scan is deferred.        |
| SC-012    | partial     | Local failure coverage passes; full Redis/Meilisearch/upstream live matrix is deferred. |
| SC-013    | partial     | Request-ID propagation/log fields pass; live failure-correlation sample is deferred.    |
| SC-014    | blocked     | Requires teammate Liara staging deployment and rollback.                                |
| SC-015    | blocked     | Requires public/staging critical acceptance and supported Next.js.                      |
| SC-016    | blocked     | Comparison gate exists; accepted repeated workload is deferred.                         |
| SC-017    | partial     | Reservation/reconciliation tests pass locally; live aggregate proof is deferred.        |
| SC-018    | implemented | All 41 FR and 18 SC rows are explicit here; none are silently omitted.                  |

## Current non-Docker implementation evidence

- Approved snapshot ingestion: 1,143 pages and 4,962 passages; revision
  `4aa2555f40e7b5d67be2b96bcf5025655dace036aaae2b121686a4d1362fbd03`.
- Candidate evaluation set: 120 schema-valid cases; SHA-256
  `74299e45eed9b202e936f1d575c636d6e36c1bd0e3d7270ba2f5048f294f0f0c`; domain/quality owner
  acceptance remains pending.
- Offline lexical held-out baseline: recall@8 `0.6316`, MRR `0.4589`, nDCG@8 `0.5126`, approved
  destination validity `1.0`; report SHA-256
  `db641bb216272c340b09c7efcec1d88f0a548c32f4a47675c16da043e7909c91`.
- Grounded REST/SSE, citation, injection, readiness, cancellation, and failure-contract tests pass
  locally without Docker. These establish implementation coverage but do not replace the pending
  reviewed live answer evaluation or Liara deployment evidence.
