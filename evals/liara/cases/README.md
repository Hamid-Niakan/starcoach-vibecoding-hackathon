# Evaluation Case Ownership

The initial `v1.jsonl` dataset is jointly reviewed by a Liara documentation reviewer and a quality
reviewer. Changes require a dataset version bump and review of expected official URLs, anchors,
required facts, cautions, forbidden claims, intent, and critical failures.

The initial accepted set must contain at least 120 cases: 30 direct, 25 complex or multi-document,
20 troubleshooting, 15 ambiguity decisions, 15 unanswerable or out-of-scope, 10 prompt-injection or
security, and 5 destructive/live-state boundaries. At least half are Persian, at least 20 are
multi-turn, and English, mixed-script, technical identifiers, and Finglish occur across categories.

`tuning` cases may calibrate retrieval and prompts. `held_out` cases must not be used for tuning.
Cases contain no real credential, customer information, or private account state.

## Version 1 inventory and review gate

`v1.jsonl` currently contains 120 schema-valid candidate cases pinned to documentation revision
`4aa2555f40e7b5d67be2b96bcf5025655dace036aaae2b121686a4d1362fbd03`: 30 direct, 25 complex,
20 troubleshooting, 15 ambiguous, 8 unanswerable, 7 out-of-scope, 10 prompt-injection, and 5
destructive/live-state cases. It contains 75 Persian, 15 English, 15 mixed, and 15 Finglish cases;
20 cases are multi-turn and 95 are held out.

The file is a review candidate, not an accepted benchmark, until both owners below record their
name, date, and approval in a reviewed release change:

| Review owner                 | Required inspection                                                    | Status  |
| ---------------------------- | ---------------------------------------------------------------------- | ------- |
| Liara documentation reviewer | Canonical URLs, expected facts/cautions, revision accuracy             | Pending |
| Quality reviewer             | Split isolation, intent, forbidden claims, critical failures, language | Pending |

Do not change either status to accepted based only on schema validation or automated retrieval
scores. Reviewers must inspect the corresponding approved source pages and bump `dataset_version`
when an accepted expectation changes.
