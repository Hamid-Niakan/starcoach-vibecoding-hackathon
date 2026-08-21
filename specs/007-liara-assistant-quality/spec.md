# Feature Specification: Liara Assistant Quality

**Feature Branch**: `codex/ai-gateway-integration`

**Created**: 2026-08-21

**Status**: Draft

**Input**: Validate the Liara documentation assistant against all hackathon criteria and implement every missing or partially implemented capability across answer quality, UX, agentic behavior, security and monitoring, Liara deployment, and cost optimization.

### Evaluation Scorecard

| Evaluation area                          | Available points |
| ---------------------------------------- | ---------------: |
| Response quality and accuracy            |               80 |
| UI design and user experience            |               55 |
| Agentic capabilities and personalization |               50 |
| Security, stability, and monitoring      |               50 |
| Deployment on Liara infrastructure       |               40 |
| Cost optimization                        |               25 |
| **Total**                                |          **300** |

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Receive Grounded Documentation Answers (Priority: P1)

As a Liara user, I can ask simple or complex technical questions and receive accurate, complete,
useful answers whose factual claims can be verified in the official Liara documentation.

**Why this priority**: Answer quality represents the largest judging category and is the core value
of a documentation assistant. A polished interface cannot compensate for unsupported guidance.

**Independent Test**: Run a versioned evaluation set containing direct lookups, ambiguous questions,
troubleshooting questions, comparisons, and multi-document tasks. Review answer correctness,
completeness, relevance, abstention, and citation validity without testing any other story.

**Acceptance Scenarios**:

1. **Given** a question directly answered by current official documentation, **When** the visitor asks it, **Then** the answer addresses the intent, includes the necessary steps or constraints, and cites the supporting official pages.
2. **Given** a complex question requiring information from multiple documentation sections, **When** the visitor asks it, **Then** the response combines the relevant evidence coherently, distinguishes prerequisites from actions, and cites every section used.
3. **Given** a question whose answer is absent or uncertain in the approved sources, **When** the visitor asks it, **Then** the assistant states the limitation, avoids inventing an answer, and suggests a safe documentation or support next step.
4. **Given** sources that conflict, are version-sensitive, or appear outdated, **When** an answer is produced, **Then** the response exposes the ambiguity and does not present one interpretation as certain without evidence.
5. **Given** a troubleshooting request, **When** the response recommends commands or configuration, **Then** it explains expected outcomes, relevant cautions, and how the visitor can verify each step.

---

### User Story 2 - Continue an Accessible Conversation (Priority: P2)

As a Persian-speaking documentation visitor on desktop or mobile, I can discover, read, continue,
stop, and recover a chat without losing context or struggling with code, URLs, or technical text.

**Why this priority**: The assistant must make high-quality answers usable in a realistic continuing
conversation and must satisfy the challenge's substantial UI and UX score.

**Independent Test**: Complete the same multi-turn documentation task using keyboard-only desktop
navigation and a narrow mobile viewport, including streaming, a code block, citations, cancellation,
retry, reload, and a simulated failure.

**Acceptance Scenarios**:

1. **Given** the documentation site on desktop or mobile, **When** a visitor opens chat, **Then** the entry point, purpose, input, example prompts, and current system state are immediately understandable.
2. **Given** an answer containing Persian prose, commands, code, URLs, tables, or lists, **When** it is rendered, **Then** each content type has correct directionality, remains copyable, and does not overflow its container.
3. **Given** a continuing conversation, **When** the visitor asks a follow-up, cancels, retries, reloads, or returns to documentation, **Then** the visible state and context behave predictably without duplicated turns or stranded loading states.
4. **Given** a slow response or recoverable failure, **When** the state changes, **Then** the interface communicates progress or recovery in Persian without repeatedly announcing every streamed token to assistive technology.
5. **Given** keyboard-only or assistive-technology use, **When** the visitor operates chat, **Then** all controls have accessible names, visible focus, logical order, and deterministic focus recovery after cancel, retry, or error.

---

### User Story 3 - Get Intent-Aware Guidance (Priority: P3)

As a visitor with an incomplete, ambiguous, or multi-step goal, I receive the clarification,
personalized explanation, and next-step guidance needed to complete the task safely.

**Why this priority**: Useful agentic behavior differentiates the product from a documentation
search box and directly addresses intent understanding, personalization, and workflow handling.

**Independent Test**: Exercise a catalog of ambiguous and multi-step Liara tasks with novice and
experienced visitor profiles, verifying clarification decisions, context use, recommendations, and
safe termination without relying on the visual design score.

**Acceptance Scenarios**:

1. **Given** a question with multiple materially different interpretations, **When** answering immediately could be misleading, **Then** the assistant asks one concise, relevant follow-up before prescribing steps.
2. **Given** sufficient context to answer, **When** the visitor asks a clear question, **Then** the assistant answers directly rather than adding unnecessary clarification turns.
3. **Given** the visitor's language, stated experience, current Liara service, and prior conversation, **When** guidance is produced, **Then** terminology and detail adapt to that context without claiming knowledge the visitor did not provide.
4. **Given** a multi-step workflow, **When** the assistant guides the visitor, **Then** it tracks completed and remaining steps, checks important outcomes, and suggests the most useful next action.
5. **Given** a request that would require account access, destructive action, or unavailable real-time state, **When** the assistant responds, **Then** it explains the boundary and offers safe, reversible instructions instead of claiming the action was performed.

---

### User Story 4 - Use a Safe and Reliable Assistant (Priority: P4)

As a visitor or operator, I can rely on bounded public usage, protected secrets, safe errors,
observable failures, and stable behavior under dependency problems or abusive traffic.

**Why this priority**: Public AI access is unsafe and difficult to operate without enforcement,
redaction, failure handling, and evidence that the service remains predictable under stress.

**Independent Test**: Run security, failure-injection, load, cancellation, and observability checks
against the public assistant while inspecting only sanitized user-visible errors and operator records.

**Acceptance Scenarios**:

1. **Given** repeated, concurrent, oversized, or excessive requests, **When** configured limits are reached, **Then** further work is refused predictably without allowing unmetered usage or destabilizing other sessions.
2. **Given** invalid input, dependency loss, timeout, malformed upstream output, or interrupted streaming, **When** the request fails, **Then** the visitor receives a safe recoverable state and operators can correlate it using a request identifier.
3. **Given** application configuration, logs, browser traffic, source control, and generated artifacts, **When** they are inspected, **Then** no provider credential, protected provider identity, message body, or sensitive configuration is exposed.
4. **Given** an enforcement or required storage dependency is unavailable, **When** readiness and admission are evaluated, **Then** the service fails closed and does not accept usage it cannot correctly control.
5. **Given** sustained expected traffic, **When** operators review service health, **Then** they can observe request volume, latency, outcomes, limits, token consumption, dependency health, and alert-worthy failure trends without reading conversation content.

---

### User Story 5 - Deploy and Operate on Liara (Priority: P5)

As a teammate or operator, I can deploy the assistant to Liara infrastructure from a clean clone,
verify it, recover it, and provide the required public submission link without undocumented steps.

**Why this priority**: Deployment is a scored deliverable and the product is not complete until the
same reviewed configuration runs reliably on the target infrastructure.

**Independent Test**: A teammate follows the deployment runbook from a clean clone, deploys to a
non-production Liara environment, runs the public acceptance suite, performs a rollback exercise,
and records the resulting public URL and evidence.

**Acceptance Scenarios**:

1. **Given** a clean clone and operator-owned secrets, **When** the documented deployment steps are followed, **Then** the documentation site and assistant become healthy on Liara without local-only dependencies or source edits.
2. **Given** the deployed service, **When** health, model discovery, simple chat, complex chat, citations, streaming, limits, and failure recovery are tested, **Then** behavior matches the reviewed local acceptance contract.
3. **Given** an invalid secret, unavailable dependency, or failed release, **When** deployment or readiness is evaluated, **Then** unsafe traffic is not served and the operator has documented diagnosis and rollback steps.
4. **Given** a completed release, **When** submission evidence is assembled, **Then** it includes the deployed Liara URL, repository URL, deployed revision, configuration inventory without secret values, and acceptance results.

---

### User Story 6 - Deliver Quality Within a Cost Budget (Priority: P6)

As an operator, I can understand and control the cost of each answer while preserving the quality
needed for the challenge evaluation.

**Why this priority**: Cost optimization is explicitly scored and unbounded retrieval, context, or
generation can make an otherwise strong public assistant unsustainable.

**Independent Test**: Run the fixed quality evaluation set and a repeated-question workload under
declared budgets, compare quality and cost with the uncached baseline, and inspect per-request and
aggregate usage records.

**Acceptance Scenarios**:

1. **Given** a simple factual question, **When** it can be answered with limited evidence and context, **Then** the assistant avoids unnecessary retrieval, history, or response length while retaining a complete answer.
2. **Given** a complex question, **When** additional evidence or reasoning materially improves correctness, **Then** the assistant may spend more within the declared budget and records why the larger request was justified.
3. **Given** a repeated semantically equivalent question with unchanged approved sources, **When** a verified reusable result is available, **Then** redundant external work is reduced without serving stale or cross-session private content.
4. **Given** any request, **When** its usage is recorded, **Then** operators can inspect input, output, retrieval, reuse, latency, and estimated-cost measurements without exposing message content.
5. **Given** a proposed cost optimization, **When** it is evaluated, **Then** it is accepted only if measured quality remains within the allowed regression threshold.

### Edge Cases

- The question is in Persian, English, Finglish, or mixes languages and technical identifiers.
- The question is extremely short, contains only an error message, or omits the service and runtime
  needed to diagnose it.
- The visitor requests information outside Liara documentation, asks for account-specific state, or
  asks the assistant to perform an action it cannot perform.
- The relevant page was renamed, removed, duplicated, or updated after a reusable answer was stored.
- Retrieval finds no evidence, too much weak evidence, or conflicting passages from different
  documentation versions.
- A cited fragment exists but does not actually support the adjacent claim.
- A response includes unsafe commands, destructive instructions, secrets pasted by the visitor, or
  untrusted text that attempts to override assistant rules.
- Conversation history is long, contains a stopped or failed turn, or shifts to a new topic.
- The visitor opens multiple independent tabs, reloads during a stream, loses connectivity, or
  receives only part of a response.
- A dependency becomes slow or unavailable while readiness remains healthy for unrelated functions.
- Limits are reached simultaneously across multiple service instances.
- Cached or reusable content becomes stale when the approved documentation revision changes.
- Liara deployment starts with a partially applied configuration or a revision incompatible with a
  required dependency.

## Requirements _(mandatory)_

### Functional Requirements

#### Evaluation and Remediation

- **FR-001**: The feature MUST begin with a versioned baseline assessment that maps every criterion
  and subcriterion in this specification to `implemented`, `partially implemented`, `missing`, or
  `blocked`, with direct evidence and a reproducible validation method.
- **FR-002**: Every item classified as partially implemented or missing MUST have a remediation and
  an acceptance check; no item may be marked implemented based only on code presence or subjective
  inspection.
- **FR-003**: The assessment MUST preserve before-and-after results for the same evaluation cases so
  quality, reliability, latency, and cost changes are comparable.

#### Response Quality and Accuracy

- **FR-004**: Answers MUST be grounded only in an approved, revision-identified set of official Liara
  documentation sources and MUST distinguish source-backed facts from cautious general guidance.
- **FR-005**: The assistant MUST retrieve and rank relevant information for both direct and
  multi-document questions, while excluding evidence that does not support the visitor's intent.
- **FR-006**: Factual and procedural claims MUST include suitable official citations located close to
  the supported claim; citation targets MUST be reachable and must substantively support the claim.
- **FR-007**: Answers MUST be relevant, complete enough to act on, and structured around the user's
  goal, including prerequisites, ordered actions, expected outcomes, cautions, and verification when
  those elements are relevant.
- **FR-008**: When approved evidence is absent, insufficient, conflicting, or version-sensitive, the
  assistant MUST disclose uncertainty, avoid unsupported claims, and recommend a safe next step.
- **FR-009**: The product MUST maintain a representative, versioned evaluation set covering simple,
  complex, Persian, English, ambiguous, troubleshooting, comparison, and unanswerable questions.
- **FR-010**: Evaluation records MUST make the question, expected evidence, response, cited sources,
  grading result, documentation revision, and failure category inspectable without storing secrets.

#### UI Design and User Experience

- **FR-011**: Chat MUST provide discoverable entry points, clear Persian-first onboarding, useful
  example prompts, visible system states, and a responsive full-screen experience on supported
  desktop and mobile sizes.
- **FR-012**: Responses MUST render headings, paragraphs, ordered steps, tables, links, citations,
  inline code, code blocks, and copy actions accessibly, with explicit RTL/LTR isolation.
- **FR-013**: Streaming, stop, retry, follow-up, reload, new-tab, empty, offline, incomplete-stream,
  rate-limit, timeout, and dependency-failure states MUST remain understandable and recoverable.
- **FR-014**: Continuing conversation state MUST preserve valid visible context, avoid duplicate or
  orphan turns, and clearly identify stopped or failed output.
- **FR-015**: All chat functionality MUST be keyboard operable, expose semantic names and status,
  retain visible focus, avoid repetitive token-by-token announcements, and meet the project's
  accessibility and contrast requirements.
- **FR-016**: The UI MUST expose citations, request identifiers when errors occur, and feedback
  controls without exposing provider or secret information.

#### Agentic Capabilities and Personalization

- **FR-017**: The assistant MUST classify whether a request is answerable, requires clarification,
  requires multiple steps, is outside scope, or presents elevated risk before composing guidance.
- **FR-018**: The assistant MUST ask a concise follow-up only when missing information would
  materially change the answer; otherwise it MUST answer directly.
- **FR-019**: Responses MUST adapt language, terminology, explanation depth, current service, and
  workflow state using only preferences and context explicitly supplied in the current conversation.
- **FR-020**: The assistant MUST maintain relevant conversation context within declared bounds,
  exclude failed output, handle topic changes, and avoid treating prior assumptions as confirmed facts.
- **FR-021**: Multi-step guidance MUST identify progress, prerequisites, validation points, safe
  recovery, and a practical next step rather than presenting an unstructured information dump.
- **FR-022**: The assistant MUST NOT claim to inspect accounts, deploy services, change settings, or
  observe live state unless a future approved capability actually performs and verifies that action.
- **FR-023**: Agentic and personalization behavior MUST be covered by versioned intent, clarification,
  context, and workflow evaluations, including cases where clarification is unnecessary.

#### Security, Stability, and Monitoring

- **FR-024**: Public usage MUST enforce validated limits for request size, message count, token use,
  request rate, quota, concurrency, and total request lifetime consistently across service instances.
- **FR-025**: Credentials and protected configuration MUST remain outside source control and browser
  artifacts, be supplied through validated operator-owned configuration, and be redacted from every
  error, log, trace, metric label, and support view.
- **FR-026**: Dependency failures, malformed outputs, disconnects, timeouts, cancellation, and partial
  streams MUST have bounded behavior, safe user messages, correlation identifiers, and deterministic
  cleanup.
- **FR-027**: The assistant MUST minimize unnecessary requests, retrieval, conversation history, and
  output while maintaining the measured quality thresholds.
- **FR-028**: Operators MUST have content-free visibility into traffic, latency, status, failure
  categories, limits, token consumption, estimated cost, dependency health, and readiness.
- **FR-029**: Monitoring MUST define actionable thresholds and an operator response for elevated
  error rates, latency, limit exhaustion, dependency failure, and unexpected usage or cost.
- **FR-030**: Required enforcement dependencies MUST fail closed; readiness MUST distinguish whether
  the service can safely accept traffic from whether an optional upstream is available for a request.
- **FR-031**: Architecture and operating procedures MUST support independent scaling, cancellation,
  controlled rollout, rollback, and maintenance without coupling the ZarinPal product.

#### Liara Deployment and Production Readiness

- **FR-032**: Public deployment MUST remain blocked until every required framework and dependency is
  on a supported security-patched release and all release gates pass.
- **FR-033**: A clean-clone deployment runbook MUST identify prerequisites, configuration names,
  secret ownership, build steps, health checks, dependency ordering, scaling assumptions, rollback,
  troubleshooting, and evidence collection for Liara infrastructure.
- **FR-034**: The deployed product MUST use the same reviewed public behavior and security boundaries
  as the accepted local build, without development-only fixtures or credentials.
- **FR-035**: Automated and manual acceptance checks MUST validate the deployed Liara URL on desktop
  and mobile, including documentation access, chat, citations, continuing context, accessibility,
  limits, sanitized failures, liveness, readiness, and rollback readiness.
- **FR-036**: Submission evidence MUST record the repository URL, deployed Liara URL, deployed
  revision, acceptance results, and a configuration inventory that contains names but no secret values.

#### Cost Optimization

- **FR-037**: Operators MUST define per-request and aggregate token, retrieval, latency, and estimated
  cost budgets for simple, complex, and repeated-question workloads before production release.
- **FR-038**: The product MUST select the least costly answer path that meets the quality thresholds,
  and any higher-cost path MUST be justified by measured improvement on the evaluation set.
- **FR-039**: Verified reusable work MAY reduce repeated external processing only when scoped safely,
  invalidated by approved-source revision changes, bounded in age, and prevented from leaking
  conversation-specific content between visitors.
- **FR-040**: Cost measurements MUST be correlated with answer-quality results so optimization cannot
  silently trade away correctness, citation coverage, safety, or usefulness.
- **FR-041**: The operator MUST be able to identify expensive request classes, reuse effectiveness,
  budget violations, and the quality impact of each optimization from redacted evidence.

### Key Entities

- **Approved Documentation Revision**: The exact official documentation snapshot eligible to support
  answers, including source identity, revision, indexed time, and freshness state.
- **Source Passage**: A bounded excerpt associated with a canonical page, heading or anchor, language,
  revision, and retrieval relevance.
- **Citation**: A relationship between an answer claim and one or more supporting official passages,
  including destination and validation status.
- **Conversation Turn**: A paired visitor request and assistant outcome with order, visible state,
  context eligibility, language, and optional failure or request identifier.
- **Intent Decision**: The assistant's classification of a request as answerable, ambiguous,
  multi-step, outside scope, or elevated risk, plus any clarification needed.
- **Evaluation Case**: A versioned question with category, expected evidence and behavior, grading
  rubric, documentation revision, and observed result.
- **Usage Record**: Redacted per-request measurements for latency, tokens, retrieval, reuse, outcome,
  and estimated cost; it contains no message body or credential.
- **Operational Alert**: A threshold breach tied to a sanitized metric, severity, runbook, owner, and
  resolution state.
- **Deployment Evidence**: The deployed revision, public endpoints, configuration-name inventory,
  acceptance results, timestamp, and rollback reference.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On the approved evaluation set, at least 90% of simple questions and 85% of complex
  questions receive fully correct or acceptable answers under the published rubric.
- **SC-002**: At least 95% of factual claims in answerable evaluation responses are supported by an
  adjacent valid official citation, and 100% of displayed citation links resolve to approved sources.
- **SC-003**: At least 95% of unanswerable or insufficient-evidence cases avoid unsupported factual
  claims and provide an explicit limitation plus a safe next step.
- **SC-004**: At least 90% of troubleshooting and multi-step cases include the required prerequisites,
  ordered actions, verification points, and useful next step without a critical omission.
- **SC-005**: At least 90% of ambiguous intent cases make the rubric-approved clarify-versus-answer
  decision, while unnecessary follow-up questions occur in fewer than 10% of clear cases.
- **SC-006**: At least 90% of continuing-conversation cases retain relevant context without carrying
  failed output, stale assumptions, or unrelated prior topics into the answer.
- **SC-007**: In deterministic acceptance testing, at least 95% of successful requests show the first
  visible answer content within 2 seconds, and all requests reach a completed, stopped, or recoverable
  failed state within their declared lifetime.
- **SC-008**: All required desktop and mobile journeys pass at 390-pixel and 1440-pixel viewport
  widths with no clipped controls, unreadable code, broken citation interaction, or horizontal page
  overflow.
- **SC-009**: Automated accessibility review reports zero critical or serious violations in chat's
  empty, streaming, completed, stopped, and failed states; every journey is keyboard completable.
- **SC-010**: Security tests demonstrate that 100% of configured payload, token, rate, quota,
  concurrency, and lifetime limits reject excess work predictably across supported service instances.
- **SC-011**: Secret and redaction scans find zero credentials, protected provider identifiers,
  message bodies, or raw client addresses in tracked files, browser assets, errors, logs, traces, and
  metric labels.
- **SC-012**: Failure-injection tests cover every required dependency and failure category; unsafe
  enforcement loss produces a not-ready state and zero admitted unmetered requests.
- **SC-013**: Operators can correlate at least 99% of failed requests from the user-visible request
  identifier to a sanitized outcome record and applicable runbook.
- **SC-014**: A teammate can deploy from a clean clone to a Liara staging environment, complete all
  public acceptance checks, and execute or simulate rollback in under 30 minutes using only the
  documented runbook.
- **SC-015**: The deployed revision passes 100% of critical answer, citation, security, readiness,
  responsive, and accessibility gates before its public URL is accepted as submission evidence.
- **SC-016**: Compared with the measured uncached baseline workload, the optimized workload reduces
  estimated external processing cost by at least 25% while decreasing overall answer-quality score
  by no more than 2 percentage points and introducing no critical safety regression.
- **SC-017**: 100% of accepted requests remain within their declared cost and token budgets, or are
  predictably rejected or shortened with a safe explanation before exceeding them.
- **SC-018**: The completed assessment contains evidence for every hackathon subcriterion and leaves
  zero items classified as missing or partially implemented; externally blocked deployment evidence
  is clearly identified and prevents feature completion.

## Assumptions

- The assistant remains publicly accessible and anonymous for the hackathon; authenticated accounts,
  long-term cross-device history, and account-specific actions are outside this feature.
- Personalization uses only language, experience level, service, preferences, and task context stated
  in the current tab's conversation. It does not infer or retain identity or sensitive profile data.
- Official Liara documentation and its recorded source repository revision are the only authoritative
  sources for Liara product claims. General model knowledge may help interpret a question but cannot
  support a Liara-specific factual claim.
- Persian is the primary product language; English questions and technical terms remain supported.
- Provider and model selection will be chosen during planning from measured quality, latency, and
  cost evidence. Clients continue to see only a stable public model identity.
- The existing public gateway and Liara chat integration are prerequisites. Their
  incomplete live-container and browser acceptance evidence must be closed rather than duplicated or
  silently assumed complete.
- Public deployment depends on completion of the supported frontend-version feature; local or staging
  evaluation does not waive that release gate.
- Liara infrastructure access, DNS, operator-owned production secrets, and a repository URL will be
  available during deployment validation. If access is unavailable, deployment remains explicitly
  blocked and cannot be counted as complete.
- This feature does not connect the ZarinPal dashboard, analyze merchant data, add autonomous account
  mutation, or broaden the assistant beyond Liara documentation support.
