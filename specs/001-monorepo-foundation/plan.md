# Implementation Plan: Monorepo Foundation

**Branch**: `codex/monorepo-foundation` | **Date**: 2026-08-20 | **Spec**: [spec.md](./spec.md)

## Summary

Create a pnpm/Turborepo workspace, import a pinned Liara docs snapshot, scaffold the ZarinPal Next.js shell and NestJS API, create three shared package boundaries, and provide reproducible local/container workflows. Product behavior is deferred.

## Technical Context

**Runtime**: Node.js 24, strict TypeScript for new code
**Applications**: Next.js 14/React 18 frontends; NestJS API
**UI**: Existing Liara Tailwind design; Tailwind 3 and shadcn/ui conventions for ZarinPal
**Workspace**: pnpm 10.15.0 and Turborepo
**Testing**: Vitest/Jest-compatible unit tests, Nest testing utilities, build/type checks
**Deployment**: Multi-stage Docker images, root Compose, three deployment overlays

## Constitution Check

- Spec-first gate: PASS; specification and checklist are complete.
- Independent boundaries: PASS; three deployables and one-directional package dependencies.
- Traceability: PASS; upstream source commit and future dataset provenance are documented.
- Security/reproducibility: PASS; exact toolchain, ignored secrets/data, unsupported-version release gate.
- Accessible UX: PASS; Persian-first shell and directionality acceptance checks.

## Project Structure

```text
apps/{liara-docs,zarin-dashboard,api}
packages/{contracts,api-client,chat-ui}
deploy/
docs/{architecture,challenges}
data/zarinpal/
```

## Design Decisions

- Import Liara as a squashed snapshot so one clone contains all content; record source commit and update command.
- Keep root configuration small instead of adding config packages with no runtime value.
- Make shared packages buildable TypeScript libraries with explicit public entrypoints.
- Keep the API health route database-independent so later storage failures do not break liveness.
- Treat Dockerfiles as monorepo-root build contexts so workspace dependencies are available during image builds.

## Complexity Tracking

Next.js 14 is a time-bounded constitution exception for the upstream import. The release-gate script and feature 005 are the required remediation; public deployment remains blocked.
