import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import addFormats from "ajv-formats";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";

export type EvaluationCaseRecord = Record<string, unknown>;
export type EvaluationReportStatus =
  | "running"
  | "awaiting_human_review"
  | "accepted"
  | "rejected";

const contractsRoot = resolve(
  process.cwd(),
  "specs/007-liara-assistant-quality/contracts",
);

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

let caseValidator: ValidateFunction | undefined;
let reportValidator: ValidateFunction | undefined;

async function compileSchema(name: string): Promise<ValidateFunction> {
  const schema = JSON.parse(
    await readFile(resolve(contractsRoot, name), "utf8"),
  ) as object;
  return ajv.compile(schema);
}

async function getCaseValidator(): Promise<ValidateFunction> {
  caseValidator ??= await compileSchema("evaluation-case.schema.json");
  return caseValidator;
}

async function getReportValidator(): Promise<ValidateFunction> {
  reportValidator ??= await compileSchema("evaluation-report.schema.json");
  return reportValidator;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function checksumJson(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export async function loadEvaluationCases(
  path: string,
): Promise<EvaluationCaseRecord[]> {
  const validate = await getCaseValidator();
  const lines = (await readFile(path, "utf8")).split(/\r?\n/);
  const records: EvaluationCaseRecord[] = [];
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`invalid evaluation JSON at line ${index + 1}`);
    }
    if (!validate(parsed)) {
      throw new Error(
        `invalid evaluation case at line ${index + 1}: ${ajv.errorsText(validate.errors)}`,
      );
    }
    records.push(parsed as EvaluationCaseRecord);
  }
  return records;
}

export async function validateEvaluationReport(report: unknown): Promise<void> {
  const validate = await getReportValidator();
  if (!validate(report)) {
    throw new Error(
      `invalid evaluation report: ${ajv.errorsText(validate.errors)}`,
    );
  }
}

const prohibitedKeys = new Set([
  "api_key",
  "authorization",
  "cache_key",
  "client_ip",
  "credential",
  "identity_secret",
  "meili_api_key",
  "message_body",
  "metrics_token",
  "model_id",
  "passage_content",
  "provider",
  "provider_model",
  "provider_url",
  "raw_query",
  "secret",
]);

export function scanProhibitedEvidence(value: unknown): string[] {
  const findings: string[] = [];
  function visit(nested: unknown, path: string): void {
    if (Array.isArray(nested)) {
      nested.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (nested === null || typeof nested !== "object") return;
    for (const [key, child] of Object.entries(
      nested as Record<string, unknown>,
    )) {
      const childPath = `${path}.${key}`;
      if (prohibitedKeys.has(key.toLowerCase())) findings.push(childPath);
      visit(child, childPath);
    }
  }
  visit(value, "$ ".trim());
  return findings;
}

export async function writeEvidenceJson(
  artifactRoot: string,
  relativePath: string,
  value: unknown,
): Promise<string> {
  const root = resolve(artifactRoot);
  const target = resolve(root, relativePath);
  const relation = relative(root, target);
  if (relation === ".." || relation.startsWith(`..${sep}`)) {
    throw new Error("outside_artifact_root");
  }
  const findings = scanProhibitedEvidence(value);
  if (findings.length > 0) {
    throw new Error(`prohibited_evidence_fields:${findings.join(",")}`);
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return target;
}

export function assertReportTransition(
  from: EvaluationReportStatus,
  to: EvaluationReportStatus,
  gateStatuses: string[],
): void {
  const allowed: Record<EvaluationReportStatus, EvaluationReportStatus[]> = {
    running: ["awaiting_human_review", "rejected"],
    awaiting_human_review: ["accepted", "rejected"],
    accepted: [],
    rejected: [],
  };
  if (!allowed[from].includes(to)) throw new Error("invalid_report_transition");
  if (to === "accepted" && gateStatuses.some((status) => status !== "pass")) {
    throw new Error("acceptance_gate_failed");
  }
}
