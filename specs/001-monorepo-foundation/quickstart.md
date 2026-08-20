# Quickstart Validation: Monorepo Foundation

1. Use Node.js 24 and enable the pinned pnpm release with Corepack.
2. Copy `.env.example` to `.env` and run `pnpm install --frozen-lockfile`.
3. Run `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm type-check`, and `pnpm test`.
4. Run each application through its filtered `dev` command.
5. Confirm Liara documentation renders, the ZarinPal Persian shell renders, and `/api/health` returns `{"status":"ok"}`.
6. Run the release gate and confirm it intentionally fails while Next.js 14 is installed.
7. Run `docker compose config` for `compose.yaml` and each file under `deploy/`.

Expected result: all quality and configuration checks pass except the explicitly documented public-release gate.
