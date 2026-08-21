import { createHash } from "node:crypto";
import {
  deploymentEvidenceSchema,
  type DeploymentEvidence,
} from "../../packages/contracts/src/index.js";

export type DeploymentEvidenceInput = Omit<
  DeploymentEvidence,
  "schemaVersion" | "acceptanceChecksum"
> & { acceptanceReport: unknown };

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function assembleDeploymentEvidence(
  input: DeploymentEvidenceInput,
  expectedDocumentationRevision = input.documentationRevision,
): DeploymentEvidence {
  const { acceptanceReport, ...fields } = input;
  if (input.documentationRevision !== expectedDocumentationRevision) {
    throw new Error("deployment documentation revision mismatch");
  }
  return deploymentEvidenceSchema.parse({
    ...fields,
    schemaVersion: 1,
    acceptanceChecksum: sha256Json(acceptanceReport),
  });
}
