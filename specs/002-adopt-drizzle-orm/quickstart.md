# Quickstart: Validate the Drizzle ORM Foundation

This guide validates dependency ownership, the dialect declaration, architectural boundaries, and documentation. It does not provision PostgreSQL, request credentials, generate migrations, or define a schema.

## Prerequisites

- The Monorepo foundation in `specs/001-monorepo-foundation` has been implemented.
- The documented Node.js Active LTS release and pinned pnpm version are installed.
- No PostgreSQL service or database environment variable is required.

## 1. Install from a clean checkout

```bash
pnpm install --frozen-lockfile
```

Expected result: installation succeeds from the root, all five workspaces are discovered, and no database prompt or connection attempt occurs. While initially creating or intentionally updating the lockfile, use `pnpm install`; committed clean-checkout validation uses `--frozen-lockfile`.

## 2. Confirm API ownership and ORM exclusivity

```bash
pnpm --filter @hackathon/api list drizzle-orm drizzle-kit --depth 0
```

Expected result: the API declares `drizzle-orm` and its development tooling. Inspection of all workspace manifests and the lockfile finds no Drizzle dependency in either frontend or shared package, no competing ORM, and no PostgreSQL runtime connection driver introduced by this feature.

## 3. Validate the configuration boundary

Inspect `apps/api/drizzle.config.ts` and run the API test task:

```bash
pnpm --filter @hackathon/api test
```

Expected result: the focused test loads the TypeScript configuration and proves that its dialect is `postgresql`. The configuration contains no `schema`, `out`, `dbCredentials`, `driver`, `migrations`, environment import, client initialization, or query behavior.

## 4. Confirm that deferred artifacts are absent

Inspect the implementation diff and repository for artifacts introduced by this feature.

Expected result: there are no schema definitions, migration directories or files, generated SQL, seed scripts, database lifecycle scripts, `DATABASE_URL` requirement, Nest database provider, or connection initialization.

## 5. Run repository quality gates

```bash
pnpm build
pnpm lint
pnpm format:check
pnpm type-check
pnpm test
```

Expected result: all commands succeed without PostgreSQL, credentials, or database environment variables.

## 6. Verify credential-free API health

Start the API with database environment variables absent:

```bash
pnpm --filter @hackathon/api dev
```

From another terminal, using the API port documented by feature 001:

```bash
curl -i http://localhost:<documented-port>/api/health
```

Expected result: the API makes no database connection attempt and responds with HTTP 200 and the exact body `{"status":"ok"}`. Stop the development process after validation.

## 7. Review documentation

Using only the repository README, a new developer should be able to identify within 10 minutes:

- Drizzle is the sole approved ORM.
- PostgreSQL is the future target.
- `apps/api` owns persistence.
- Live connections, runtime drivers, credentials, schemas, migrations, seeds, queries, and repositories are deferred.

## Acceptance Summary

- Exactly one approved ORM
- Zero competing ORM dependencies
- Zero schemas, migrations, seeds, or database commands
- Zero Drizzle dependencies in frontends or shared packages
- All existing quality gates pass
- API startup remains credential-free
- Health endpoint contract remains unchanged
