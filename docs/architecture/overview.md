# Architecture Overview

The two Next.js applications call one independently deployed NestJS API through versioned contracts. PostgreSQL owns transactional chat state; DuckDB is an in-process analytical engine owned only by the API. Shared packages form a one-way dependency layer and never import application code.

Product endpoints remain separate (`/api/v1/liara/*` and `/api/v1/zarinpal/*`) even when they reuse the same chat service. This preserves authorization and data-boundary options for later features.
