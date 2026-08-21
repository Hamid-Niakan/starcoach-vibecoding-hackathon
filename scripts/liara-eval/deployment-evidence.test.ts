import { describe, expect, it } from "vitest";

import { assembleDeploymentEvidence } from "./deployment-evidence.js";

const digest = `sha256:${"a".repeat(64)}`;
const input = {
  gitSha: "b".repeat(40),
  documentationRevision: "c".repeat(64),
  imageDigests: {
    gateway: digest,
    docs: `sha256:${"d".repeat(64)}`,
  },
  configurationNames: ["AI_GATEWAY_API_KEY", "AI_GATEWAY_REDIS_URL"],
  operator: "release-operator",
  stagedAt: "2026-08-21T10:00:00.000Z",
  publicUrls: {
    gateway: "https://gateway.example.com",
    docs: "https://docs.example.com",
  },
  acceptanceReport: { passed: true },
  rollback: {
    startedAt: "2026-08-21T10:10:00.000Z",
    completedAt: "2026-08-21T10:20:00.000Z",
    durationSeconds: 600,
    result: "passed" as const,
    fromGatewayDigest: digest,
    toGatewayDigest: `sha256:${"e".repeat(64)}`,
  },
};

describe("deployment evidence", () => {
  it("assembles schema-valid checksummed evidence without configuration values", () => {
    const value = assembleDeploymentEvidence(input);
    expect(value.acceptanceChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(value)).not.toContain("secret-value");
    expect(value.configurationNames).toEqual(input.configurationNames);
  });
  it("rejects revision mismatch shapes, duplicate configuration names, and incomplete rollback", () => {
    expect(() =>
      assembleDeploymentEvidence({ ...input, documentationRevision: "bad" }),
    ).toThrow();
    expect(() => assembleDeploymentEvidence(input, "f".repeat(64))).toThrow(
      /revision mismatch/,
    );
    expect(() =>
      assembleDeploymentEvidence({
        ...input,
        configurationNames: ["AI_GATEWAY_API_KEY", "AI_GATEWAY_API_KEY"],
      }),
    ).toThrow();
    expect(() =>
      assembleDeploymentEvidence({
        ...input,
        rollback: { ...input.rollback, durationSeconds: 1801 },
      }),
    ).toThrow();
  });
});
