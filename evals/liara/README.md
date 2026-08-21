# Liara Assistant Evaluations

This directory contains reviewed, provider-neutral inputs used to measure the Liara documentation
assistant before and after remediation.

- `cases/` contains tracked JSONL cases. Cases may include only intentional evaluation prompts and
  official-source expectations; never paste credentials, customer data, or private account state.
- `rubrics/` contains deterministic and human grading definitions.
- generated reports, provider responses, candidate comparisons, indexes, screenshots, and staging
  evidence belong under the gitignored `.artifacts/liara/` tree.

## Generated artifact layout

```text
.artifacts/liara/
├── baseline/
├── index/
├── us1/ ... us6/
├── staging/
└── final/
```

Every shareable report must validate against the feature-007 schemas, record input artifact
checksums, and use protected digests instead of provider/model identifiers. Raw messages outside the
reviewed case set, retrieved passages, client addresses, cache keys, and secrets are prohibited.
