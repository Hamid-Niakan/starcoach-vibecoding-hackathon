# Contributing

Work from a feature branch, keep `.specify/feature.json` pointed at the active feature, and complete spec → plan → tasks before implementation. Use `pnpm --filter <workspace> ...` during development and run all root terminating checks before handing work to another teammate.

Do not commit secrets, raw merchant data, generated DuckDB files, or local database volumes. New shared contracts belong in `@hackathon/contracts`; consumers must import package entrypoints rather than another application's source.

The imported Liara tree contains upstream legacy JavaScript. New or materially changed files must use strict TypeScript, but broad mechanical conversion is outside unrelated features.
