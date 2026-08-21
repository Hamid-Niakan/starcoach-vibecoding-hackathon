import { describe, expect, it } from "vitest";

import {
  compareRepeatedWorkload,
  selectPublicCandidate,
} from "./cost-runner.js";

describe("cost quality gates", () => {
  it("accepts at least 25% savings with no more than two quality points lost", () => {
    const report = compareRepeatedWorkload(
      { qualityScore: 92, estimatedCostMicroUnits: 1000, requests: 100 },
      { qualityScore: 91, estimatedCostMicroUnits: 700, requests: 100 },
    );
    expect(report.passed).toBe(true);
    expect(report.savingsPercent).toBe(30);
    expect(report.qualityRegressionPoints).toBe(1);
  });

  it("rejects insufficient savings or a material quality regression", () => {
    expect(
      compareRepeatedWorkload(
        { qualityScore: 92, estimatedCostMicroUnits: 1000, requests: 100 },
        { qualityScore: 89, estimatedCostMicroUnits: 600, requests: 100 },
      ).passed,
    ).toBe(false);
    expect(
      compareRepeatedWorkload(
        { qualityScore: 92, estimatedCostMicroUnits: 1000, requests: 100 },
        { qualityScore: 92, estimatedCostMicroUnits: 800, requests: 100 },
      ).passed,
    ).toBe(false);
  });

  it("publishes only a stable alias and policy digest for the cheapest passing candidate", () => {
    const selected = selectPublicCandidate(
      [
        {
          protectedModel: "provider/expensive",
          qualityScore: 95,
          latencyP95Ms: 1200,
          estimatedCostMicroUnits: 900,
        },
        {
          protectedModel: "provider/cheap",
          qualityScore: 92,
          latencyP95Ms: 1000,
          estimatedCostMicroUnits: 400,
        },
      ],
      {
        minimumQuality: 90,
        maximumLatencyMs: 1500,
        publicAlias: "liara-assistant",
      },
    );
    expect(selected.model).toBe("liara-assistant");
    expect(selected.policyDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(selected)).not.toContain("provider/");
  });
});
