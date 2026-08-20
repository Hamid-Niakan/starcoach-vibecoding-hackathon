FROM node:24-bookworm-slim AS builder
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@hackathon/api

FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production API_PORT=3000 DRIZZLE_MIGRATIONS_DIR=/app/apps/api/drizzle
WORKDIR /app
RUN useradd --system --uid 1001 api && mkdir -p /data && chown api:api /data
COPY --from=builder --chown=api /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml ./
COPY --from=builder --chown=api /workspace/node_modules ./node_modules
COPY --from=builder --chown=api /workspace/packages/contracts ./packages/contracts
COPY --from=builder --chown=api /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=api /workspace/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=api /workspace/apps/api/drizzle ./apps/api/drizzle
COPY --from=builder --chown=api /workspace/apps/api/package.json ./apps/api/package.json
USER api
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
