# Implementation Plan: Supported Next.js Upgrade

## Technical Context

Upgrade the two Next.js applications together so their React-compatible shared packages remain on one tested runtime surface. Select the exact patched release only after checking official support guidance during implementation.

## Sequence

1. Capture baseline builds, representative routes, and release-gate failure.
2. Upgrade Next.js and required peer/tooling versions with an exact lockfile.
3. Apply documented configuration and MDX compatibility changes.
4. Run unit, type, lint, route, responsive, production, and container regressions.
5. Change no product behavior; record upgrade decisions and make the release gate pass.

## Constitution Check

The feature is independently testable, preserves application deployment boundaries, uses reproducible exact versions, and is the mandatory security gate before deployment.
