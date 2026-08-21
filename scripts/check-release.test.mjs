import assert from "node:assert/strict";
import test from "node:test";

import { evaluateRelease } from "./check-release-lib.mjs";

const accepted = { status: "accepted", gate_results: [{ status: "pass" }] };
const evidence = {
  documentationRevision: "a".repeat(64),
  rollback: { completedAt: "2026-08-21T10:00:00Z", result: "passed" },
};

test("rejects unsupported Next.js", () => {
  assert.match(
    evaluateRelease({
      manifests: [{ name: "docs", dependencies: { next: "14.2.35" } }],
      expectedRevision: "a".repeat(64),
      criticalReports: [accepted],
      deploymentEvidence: evidence,
    }).join(" "),
    /unsupported/,
  );
});
test("rejects missing critical reports", () => {
  assert.match(
    evaluateRelease({
      manifests: [{ name: "docs", dependencies: { next: "15.5.9" } }],
      expectedRevision: "a".repeat(64),
      criticalReports: [null],
      deploymentEvidence: evidence,
    }).join(" "),
    /critical evaluation/,
  );
});
test("rejects mismatched corpus revision and missing rollback", () => {
  const blockers = evaluateRelease({
    manifests: [{ name: "docs", dependencies: { next: "15.5.9" } }],
    expectedRevision: "b".repeat(64),
    criticalReports: [accepted],
    deploymentEvidence: { ...evidence, rollback: null },
  });
  assert.ok(blockers.includes("corpus revision mismatch"));
  assert.ok(blockers.includes("rollback evidence missing"));
});
test("passes only a complete compatible release", () => {
  assert.deepEqual(
    evaluateRelease({
      manifests: [{ name: "docs", dependencies: { next: "15.5.9" } }],
      expectedRevision: "a".repeat(64),
      criticalReports: [accepted],
      deploymentEvidence: evidence,
    }),
    [],
  );
});
