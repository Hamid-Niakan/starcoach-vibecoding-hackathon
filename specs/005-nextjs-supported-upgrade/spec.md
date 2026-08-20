# Feature Specification: Supported Next.js Upgrade

**Created**: 2026-08-20 | **Status**: Approved, not started

## User Scenarios & Testing

### User Story 1 - Ship Supported Frontends (Priority: P1)

As an operator, I can build and deploy both frontends on a supported, security-patched Next.js release without changing their product behavior.

### User Story 2 - Preserve Imported Documentation (Priority: P2)

As a Liara documentation visitor, representative MDX pages, assets, search fallback, RTL layout, and chat entry points continue to work after the framework upgrade.

## Requirements

- Both frontends MUST upgrade from Next.js 14 to at least patched Next.js 15.5 Maintenance LTS before public deployment.
- The implementation MUST confirm the supported target against official Next.js guidance at execution time and record exact versions in the lockfile.
- React, ESLint, TypeScript, MDX, Tailwind, and build configuration changes MUST be handled explicitly rather than suppressed.
- The Liara upstream subtree boundary and attribution MUST remain intact.
- The release gate MUST fail on unsupported versions and pass only when both applications satisfy policy.
- Route, production build, container, RTL/LTR, and shared chat regression tests MUST pass.

## Success Criteria

- `pnpm release:check` passes for both frontends.
- Clean-clone builds and independently runnable containers pass without framework security warnings covered by the gate.
- Representative Liara routes and the ZarinPal desktop/mobile shell retain milestone behavior.

## Out of Scope

- RAG, real model providers, redesigning Liara, and ZarinPal analytical business logic.
