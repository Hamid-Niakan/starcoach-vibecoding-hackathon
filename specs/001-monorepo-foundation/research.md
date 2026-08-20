# Research: Monorepo Foundation

## Liara source import

**Decision**: Import the official repository as a pinned squashed snapshot under `apps/liara-docs` and retain provenance documentation.

**Rationale**: It preserves the challenge's documentation and visual baseline while keeping teammate checkout and Docker builds self-contained.

**Alternatives considered**: A submodule adds onboarding/deployment failure modes; a Nuxt rewrite spends hackathon time on parity rather than answer quality.

## Frontend compatibility

**Decision**: Use React 18-compatible shared packages and Tailwind 3 during the import milestone.

**Rationale**: This matches the imported Next.js 14 application and allows the new dashboard to share the chat layer.

**Alternative considered**: Immediate Next.js 16 migration is safer long-term but materially increases import risk; feature 005 handles the supported upgrade before release.

## Workspace and containers

**Decision**: pnpm plus Turborepo, with Docker builds using the repository root context.

**Rationale**: One lockfile and explicit task graph make application and shared-package builds reproducible without publishing internal packages.

**Alternatives considered**: Independent package-manager roots duplicate dependencies and weaken contract synchronization.
