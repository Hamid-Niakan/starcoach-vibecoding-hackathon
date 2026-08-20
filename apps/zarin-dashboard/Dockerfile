FROM node:24-bookworm-slim AS builder
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/zarin-dashboard ./apps/zarin-dashboard
RUN pnpm install --frozen-lockfile
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @hackathon/zarin-dashboard build

FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production PORT=3002 HOSTNAME=0.0.0.0
WORKDIR /app
RUN useradd --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs /workspace/apps/zarin-dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs /workspace/apps/zarin-dashboard/.next/static ./apps/zarin-dashboard/.next/static
COPY --from=builder --chown=nextjs /workspace/apps/zarin-dashboard/public ./apps/zarin-dashboard/public
USER nextjs
EXPOSE 3002
CMD ["node", "apps/zarin-dashboard/server.js"]
