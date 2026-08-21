import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface WorkloadResult {
  qualityScore: number;
  estimatedCostMicroUnits: number;
  requests: number;
}

export interface CandidateMeasurement {
  protectedModel: string;
  qualityScore: number;
  latencyP95Ms: number;
  estimatedCostMicroUnits: number;
}

export function compareRepeatedWorkload(
  uncached: WorkloadResult,
  optimized: WorkloadResult,
): {
  passed: boolean;
  savingsPercent: number;
  qualityRegressionPoints: number;
} {
  if (
    uncached.requests <= 0 ||
    optimized.requests !== uncached.requests ||
    uncached.estimatedCostMicroUnits <= 0 ||
    optimized.estimatedCostMicroUnits < 0
  ) {
    throw new Error("cost workload inputs are not comparable");
  }
  const savingsPercent =
    Math.round(
      ((uncached.estimatedCostMicroUnits - optimized.estimatedCostMicroUnits) /
        uncached.estimatedCostMicroUnits) *
        10_000,
    ) / 100;
  const qualityRegressionPoints =
    Math.round((uncached.qualityScore - optimized.qualityScore) * 100) / 100;
  return {
    passed: savingsPercent >= 25 && qualityRegressionPoints <= 2,
    savingsPercent,
    qualityRegressionPoints,
  };
}

export function selectPublicCandidate(
  candidates: CandidateMeasurement[],
  policy: {
    minimumQuality: number;
    maximumLatencyMs: number;
    publicAlias: string;
  },
): {
  model: string;
  policyDigest: string;
  qualityScore: number;
  latencyP95Ms: number;
  estimatedCostMicroUnits: number;
} {
  const eligible = candidates
    .filter(
      (candidate) =>
        candidate.qualityScore >= policy.minimumQuality &&
        candidate.latencyP95Ms <= policy.maximumLatencyMs,
    )
    .sort(
      (left, right) =>
        left.estimatedCostMicroUnits - right.estimatedCostMicroUnits ||
        right.qualityScore - left.qualityScore,
    );
  const selected = eligible[0];
  if (!selected)
    throw new Error("no candidate passes quality and latency policy");
  const policyDigest = createHash("sha256")
    .update(
      JSON.stringify({
        protectedModel: selected.protectedModel,
        minimumQuality: policy.minimumQuality,
        maximumLatencyMs: policy.maximumLatencyMs,
      }),
    )
    .digest("hex");
  return {
    model: policy.publicAlias,
    policyDigest,
    qualityScore: selected.qualityScore,
    latencyP95Ms: selected.latencyP95Ms,
    estimatedCostMicroUnits: selected.estimatedCostMicroUnits,
  };
}

export async function runCostEvaluation(inputPath: string): Promise<{
  schemaVersion: 1;
  repeatedWorkload: ReturnType<typeof compareRepeatedWorkload>;
  selectedPolicy: ReturnType<typeof selectPublicCandidate>;
}> {
  const input = JSON.parse(await readFile(inputPath, "utf8")) as {
    uncached: WorkloadResult;
    optimized: WorkloadResult;
    candidates: CandidateMeasurement[];
    policy: {
      minimumQuality: number;
      maximumLatencyMs: number;
      publicAlias: string;
    };
  };
  return {
    schemaVersion: 1,
    repeatedWorkload: compareRepeatedWorkload(input.uncached, input.optimized),
    selectedPolicy: selectPublicCandidate(input.candidates, input.policy),
  };
}
