import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertReportTransition,
  checksumJson,
  loadEvaluationCases,
  scanProhibitedEvidence,
  writeEvidenceJson,
} from "./evaluation-io.js";

const revision = "a".repeat(64);
const validCase = {
  id: "liara-direct-docker",
  schema_version: 1,
  dataset_version: "1.0.0",
  split: "held_out",
  documentation_revision: revision,
  messages: [{ role: "user", content: "چطور Docker مستقر کنم؟" }],
  language: "fa",
  category: "direct",
  difficulty: "simple",
  expected_intent: "direct",
  expected_sources: [{ url: "https://docs.liara.ir/paas/docker/" }],
  required_facts: ["استقرار"],
  required_cautions: [],
  forbidden_claims: [],
  security_tags: [],
  critical_failures: ["invented product fact"],
};

describe("evaluation I/O", () => {
  it("loads and validates every JSONL row with line numbers", async () => {
    const root = await mkdtemp(join(tmpdir(), "liara-eval-"));
    const file = join(root, "cases.jsonl");
    await writeFile(file, `${JSON.stringify(validCase)}\n\n`, "utf8");
    const cases = await loadEvaluationCases(file);
    expect(cases).toHaveLength(1);

    await writeFile(
      file,
      `${JSON.stringify({ ...validCase, critical_failures: [] })}\n`,
      "utf8",
    );
    await expect(loadEvaluationCases(file)).rejects.toThrow(/line 1/);
  });

  it("produces stable checksums independent of object key order", () => {
    expect(checksumJson({ a: 1, b: { c: 2 } })).toBe(
      checksumJson({ b: { c: 2 }, a: 1 }),
    );
    expect(checksumJson({ a: 2 })).not.toBe(checksumJson({ a: 1 }));
  });

  it("finds prohibited operational evidence without rejecting reviewed case messages", () => {
    expect(
      scanProhibitedEvidence({ api_key: "secret", client_ip: "127.0.0.1" }),
    ).toEqual(expect.arrayContaining(["$.api_key", "$.client_ip"]));
    expect(scanProhibitedEvidence({ case_results: [validCase] })).toEqual([]);
  });

  it("writes only below the declared artifact root", async () => {
    const root = await mkdtemp(join(tmpdir(), "liara-output-"));
    const path = await writeEvidenceJson(root, "baseline/report.json", {
      status: "running",
    });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      status: "running",
    });
    await expect(
      writeEvidenceJson(root, "../escaped.json", {}),
    ).rejects.toThrow(/outside_artifact_root/);
    expect(path.startsWith(resolve(root))).toBe(true);
  });

  it("allows only forward report transitions and requires passing acceptance gates", () => {
    expect(() =>
      assertReportTransition("running", "awaiting_human_review", []),
    ).not.toThrow();
    expect(() =>
      assertReportTransition("awaiting_human_review", "accepted", ["fail"]),
    ).toThrow(/acceptance_gate_failed/);
    expect(() => assertReportTransition("accepted", "running", [])).toThrow(
      /invalid_report_transition/,
    );
  });
});
