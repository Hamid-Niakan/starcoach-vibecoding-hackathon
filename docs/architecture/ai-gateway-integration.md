# AI Gateway Integration Provenance

This integration preserves both source histories rather than copying one implementation over the
other. The integration branch was created from the monorepo foundation and merged the gateway
branch without rewriting either source branch.

| Input                       | Pinned source commit                       | Role after integration                                  |
| --------------------------- | ------------------------------------------ | ------------------------------------------------------- |
| `codex/monorepo-foundation` | `ea3585676596ecd52b96746c4349ca19c68d0b4d` | Next.js frontends, workspace, and documentation history |
| `feat/ai-gateway-backend`   | `147887d23f78865fe718971a2bbd9e787bb54e72` | Authoritative FastAPI/OpenAI-compatible backend         |

Merge commit `536e54fa` joins these histories. The source tips above were not changed by the merge;
`scripts/check-integration-ancestry.mjs` verifies that both commit objects are ancestors of the
current integration branch and that any locally available source refs still point at the recorded
tips.

## Product boundary

Liara Docs is the only frontend connected to the gateway in this feature. The ZarinPal dashboard
remains independently buildable and intentionally contains no gateway URL, chat package, health
dependency, or `/v1` request. Its disabled assistant card states that integration is deferred until
the official dataset and analytical rules are available.

## Updating either source later

1. Fetch the source branch without rebasing or force-updating the recorded integration history.
2. Create a new feature branch from the then-current integration branch.
3. Record the new source commit in a new specification before merging it.
4. Merge the new commit normally, resolve product boundaries explicitly, and update the ancestry
   guard and this document in the same reviewed change.
5. Re-run the backend-authority, product-boundary, independent-build, and ancestry gates.

Never move these recorded pins to make a failed check pass. A source update is a new auditable
integration event.
