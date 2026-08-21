import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

const root = path.resolve(import.meta.dirname, "../..");
const alertsPath = path.join(
  root,
  "deploy/monitoring/liara-assistant-alerts.yaml",
);
const runbook = fs.readFileSync(
  path.join(root, "ai-gw/docs/liara-assistant-operations.md"),
  "utf8",
);
const document = YAML.parse(fs.readFileSync(alertsPath, "utf8")) as {
  groups: Array<{
    rules: Array<{
      alert: string;
      expr: string;
      for?: string;
      labels: { severity: string; owner: string };
      annotations: { runbook_url: string };
    }>;
  }>;
};
const rules = document.groups.flatMap((group) => group.rules);

describe("Liara assistant operational alerts", () => {
  it("defines every required bounded operational signal", () => {
    expect(rules.map((rule) => rule.alert)).toEqual(
      expect.arrayContaining([
        "LiaraAssistantNotReady",
        "LiaraAssistantLogDrops",
        "LiaraAssistantHigh5xx",
        "LiaraAssistantTimeouts",
        "LiaraAssistantSlowTTFT",
        "LiaraAssistantSlowCompletion",
        "LiaraAssistantLimitExhaustion",
        "LiaraAssistantRetrievalAnomaly",
        "LiaraAssistantCacheAnomaly",
        "LiaraAssistantDailyCostWarning",
        "LiaraAssistantDailyCostCritical",
      ]),
    );
  });

  it("gives every rule a severity, owner, stable runbook anchor, and non-empty duration", () => {
    for (const rule of rules) {
      expect(rule.labels.owner).toBe("liara-assistant-operators");
      expect(rule.labels.severity).toMatch(/warning|critical/);
      expect(rule.annotations.runbook_url).toMatch(
        /^\.\.\/\.\.\/ai-gw\/docs\/liara-assistant-operations\.md#/,
      );
      expect(rule.for).toMatch(/^\d+[ms]$/);
      expect(runbook).toContain(rule.annotations.runbook_url.split("#")[1]);
    }
  });

  it("pins the required readiness, error, timeout, TTFT, and cost thresholds", () => {
    expect(
      rules.find((rule) => rule.alert === "LiaraAssistantNotReady")?.for,
    ).toBe("2m");
    expect(
      rules.find((rule) => rule.alert === "LiaraAssistantHigh5xx")?.expr,
    ).toContain("> 0.05");
    expect(
      rules.find((rule) => rule.alert === "LiaraAssistantTimeouts")?.expr,
    ).toContain("> 0.02");
    expect(
      rules.find((rule) => rule.alert === "LiaraAssistantSlowTTFT")?.expr,
    ).toContain("> 2");
    expect(
      rules.find((rule) => rule.alert === "LiaraAssistantDailyCostWarning")
        ?.expr,
    ).toContain("> 0.8");
  });
});
