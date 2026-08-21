export function evaluateRelease(inputs) {
  const blockers = [];
  for (const manifest of inputs.manifests) {
    const version = String(manifest.dependencies?.next ?? "").replace(
      /^[~^]/,
      "",
    );
    const major = Number.parseInt(version.split(".")[0] ?? "0", 10);
    if (!Number.isFinite(major) || major < 15)
      blockers.push(
        `${manifest.name}: unsupported next@${version || "missing"}`,
      );
  }
  for (const report of inputs.criticalReports) {
    if (
      !report ||
      report.status !== "accepted" ||
      report.gate_results?.some((gate) => gate.status !== "pass")
    )
      blockers.push("critical evaluation report missing or not accepted");
  }
  if (!inputs.deploymentEvidence) blockers.push("deployment evidence missing");
  else {
    if (
      inputs.deploymentEvidence.documentationRevision !==
      inputs.expectedRevision
    )
      blockers.push("corpus revision mismatch");
    if (
      !inputs.deploymentEvidence.rollback?.completedAt ||
      inputs.deploymentEvidence.rollback?.result !== "passed"
    )
      blockers.push("rollback evidence missing");
  }
  return [...new Set(blockers)];
}
