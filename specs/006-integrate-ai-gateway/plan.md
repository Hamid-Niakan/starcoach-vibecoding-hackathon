# Implementation Plan: Integrate AI Gateway

**Branch**: `codex/ai-gateway-integration` | **Date**: 2026-08-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-integrate-ai-gateway/spec.md`

## Summary

Make the imported `ai-gw/` FastAPI service the repository's only active backend, replace the
legacy persisted-conversation TypeScript contract with a browser-facing OpenAI-compatible client,
and connect the existing Liara chat surfaces to the gateway. The root stack will run Redis, an
idempotent enforcement bootstrap, a deterministic mock upstream, the gateway, Liara Docs, and a
disconnected ZarinPal shell. Conversation state remains versioned per-tab browser state; the
gateway stores only expiring anonymous enforcement records.

## Technical Context

**Language/Version**: Python 3.12 for `ai-gw` with uv 0.8.13; TypeScript 5.9 for new
shared/frontend code; Node.js 24 and pnpm 10.33.0 for the workspace; imported Liara JavaScript
remains unchanged unless the integration requires modification

**Primary Dependencies**: FastAPI 0.115+, Pydantic 2.10+, HTTPX 0.28+, redis-py 5.2+, Uvicorn
0.34+, Redis 7.4; Next.js 14.2.35, React 18.3.1, Zod 3.25, React Markdown 9; Next.js 14 remains a
local-only baseline behind the existing release gate

**Storage**: Redis is authoritative only for expiring anonymous enforcement state; browser
`sessionStorage` owns versioned Liara conversation state; PostgreSQL and DuckDB are absent from the
active feature stack

**Testing**: pytest 8 with async, contract, integration, security, parity, and performance suites;
Ruff and strict mypy; Vitest 3 with jsdom, Testing Library, and accessibility assertions;
Playwright desktop/mobile browser smoke and latency tests; OpenAI Python SDK compatibility tests;
Docker Compose health and configuration validation

**Target Platform**: Linux containers for the gateway and static Liara site; current evergreen
desktop and mobile browsers for Liara and the ZarinPal shell; local Linux/macOS/Windows development
through Docker Compose

**Project Type**: Polyglot monorepo containing two web frontends, one web-service gateway, shared
TypeScript client/UI packages, and root orchestration

**Performance Goals**: In deterministic mock mode, first visible streamed content within 2 seconds
for at least 95% of 20 sequential smoke requests; cancellation closes the browser stream and
propagates upstream without waiting for the configured stream timeout

**Constraints**: One public model alias; anonymous browser access; explicit CORS origins/headers;
operator-owned trusted-proxy CIDRs; no provider identity exposure; stateless completions; exactly
one public terminal `[DONE]`; absolute request/stream deadlines; Redis admission fails closed; no
ZarinPal gateway call; no public release on Next.js 14

**Scale/Scope**: Hackathon deployment with one logical gateway deployment, horizontally safe Redis
enforcement, imported limits of 60 client RPM/100,000 client TPM/4 client concurrent requests and
1,000 global RPM/2,000,000 global TPM/100 global concurrent requests unless operators explicitly
configure and bootstrap a new enforcement epoch

## Constitution Check

_GATE: Passed before research and re-checked after Phase 1 design._

| Constitutional gate                       | Pre-research | Post-design evidence                                                                                                                                                                                        |
| ----------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec-first, testable delivery             | PASS         | Clarified `spec.md`, this plan, research, contracts, data model, and quickstart define the work before tasks.                                                                                               |
| Independent product boundaries            | PASS         | Liara alone consumes the gateway client; ZarinPal removes chat imports and remains independently buildable.                                                                                                 |
| Evidence and traceability                 | PASS         | Request IDs survive sanitized failures; RAG and citations remain explicitly out of scope rather than being simulated.                                                                                       |
| Security, reliability, and cost           | PASS         | Redis fail-closed admission, fixed upstream destination, bounded SSE parsing, absolute deadlines, trusted-proxy policy, CORS request-ID exposure, cancellation, and sanitized failures are contract-tested. |
| Reproducible team development             | PASS         | Pinned pnpm and uv lockfiles, root commands, deterministic mock upstream, Compose health ordering, and independent checks are designed in `quickstart.md`.                                                  |
| Persian-first accessible UX               | PASS         | Persian errors, RTL chat chrome, LTR technical islands, keyboard controls, live regions, mobile/desktop browser tests, and recoverable states are acceptance targets.                                       |
| Authoritative FastAPI/OpenAI architecture | PASS         | `ai-gw/` remains authoritative; `apps/api` and all active NestJS/PostgreSQL/DuckDB workflows are removed.                                                                                                   |
| Stateless gateway and Redis enforcement   | PASS         | Browser state is modeled separately; no conversation storage endpoint is introduced; bootstrap and readiness require Redis marker parity.                                                                   |
| Supported-framework deployment gate       | PASS         | Images may be tested locally, but `release:check` continues to block public deployment while Next.js 14 remains.                                                                                            |

No constitutional violation requires an exception.

## Project Structure

### Documentation (this feature)

```text
specs/006-integrate-ai-gateway/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── browser-chat-state.schema.json
│   └── openapi.yaml
└── tasks.md                       # generated later by $speckit-tasks
```

### Source Code (repository root)

```text
ai-gw/
├── src/ai_gateway/proxy/
│   ├── endpoints/                 # models, chat completions, health, metrics/docs
│   ├── enforcement/               # Redis bootstrap, admission, reconciliation
│   ├── middleware/                # request bounds, request IDs, headers
│   ├── observability/
│   ├── providers/
│   ├── proxy_config.py
│   └── proxy_server.py
├── tests/                         # unit, contract, integration, security, parity, performance
├── Dockerfile
├── pyproject.toml
└── uv.lock

apps/
├── liara-docs/
│   ├── src/components/ChatLauncher.tsx
│   ├── src/pages/chat.tsx
│   ├── src/pages/_app.js
│   └── Dockerfile.monorepo
└── zarin-dashboard/
    ├── app/page.tsx               # disconnected/deferred AI state
    ├── app/layout.tsx
    └── Dockerfile

packages/
├── contracts/src/                 # Zod/refinement subset of OpenAI/browser-state contracts
├── api-client/src/                # model discovery, JSON completion, bounded SSE parser/errors
└── chat-ui/src/                   # Liara conversation state machine and accessible UI

tests/e2e/                         # Liara desktop/mobile/a11y/latency and ZarinPal isolation
playwright.config.ts               # deterministic browser test configuration
compose.yaml                       # Redis, bootstrap, mock upstream, gateway, both frontends
deploy/
├── compose.gateway.yaml
├── compose.liara.yaml
└── compose.zarin.yaml
```

The legacy `apps/api/`, its migrations, PostgreSQL/DuckDB runtime services, and
`deploy/compose.api.yaml` are removed from active source and orchestration. Git history remains the
recovery path for that superseded implementation.

**Structure Decision**: Preserve `ai-gw/` as the independently testable Python project imported
from `feat/ai-gateway-backend`; preserve pnpm/Turborepo for both frontends and reusable TypeScript
packages. The live FastAPI OpenAPI document is the producer contract; the checked OpenAPI profile
and TypeScript contracts validate the smaller browser-consumed subset through parity tests.
Applications depend on packages; the gateway and packages never import application source.

## Phase 0: Research Outcomes

Research decisions and rejected alternatives are recorded in [research.md](research.md). All
technical-context questions are resolved; no `NEEDS CLARIFICATION` markers remain.

## Phase 1: Design Outcomes

- [data-model.md](data-model.md) defines the public model, stateless completion, stream, browser
  conversation, anonymous enforcement, readiness, and state transitions.
- [contracts/openapi.yaml](contracts/openapi.yaml) defines the Liara consumer profile of the
  authoritative live HTTP/SSE and health surface.
- [contracts/browser-chat-state.schema.json](contracts/browser-chat-state.schema.json) defines the
  versioned per-tab persistence boundary.
- [quickstart.md](quickstart.md) defines clean-clone, native, Compose, contract, browser,
  cancellation, readiness, isolation, and release-gate validation.

The post-design Constitution Check remains fully passing, so task generation may proceed.

## Complexity Tracking

No constitution violations or justified exceptions.
