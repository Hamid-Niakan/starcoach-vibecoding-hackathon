import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  checksumJson,
  loadEvaluationCases,
  validateEvaluationReport,
  writeEvidenceJson,
} from "./evaluation-io.ts";
import { runAnswerEvaluation } from "./answer-runner.ts";
import { runRetrievalEvaluation } from "./retrieval-runner.ts";
import { runCostEvaluation } from "./cost-runner.ts";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function gitSha(): Promise<string> {
  const head = (await readFile(resolve(".git/HEAD"), "utf8")).trim();
  if (!head.startsWith("ref: ")) return head;
  const reference = head.slice(5);
  try {
    return (await readFile(resolve(".git", reference), "utf8")).trim();
  } catch {
    const packed = await readFile(resolve(".git/packed-refs"), "utf8");
    const entry = packed
      .split(/\r?\n/)
      .find((line) => line.endsWith(` ${reference}`));
    if (!entry) throw new Error("git revision could not be resolved");
    return entry.split(" ", 1)[0]!;
  }
}

function emptyAggregate(): Record<string, number> {
  return {
    case_count: 0,
    simple_accuracy: 0,
    complex_accuracy: 0,
    citation_coverage: 0,
    citation_destination_validity: 0,
    abstention_safety: 0,
    clarification_accuracy: 0,
    context_accuracy: 0,
    ttft_p95_ms: 0,
    total_latency_p95_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_micro_units: 0,
    cache_hit_rate: 0,
  };
}

async function audit(): Promise<void> {
  const mode = argument("--mode") ?? "baseline";
  if (mode !== "baseline" && mode !== "final") {
    throw new Error("audit mode must be baseline or final");
  }
  const started = new Date().toISOString();
  const report = {
    run_id: crypto.randomUUID(),
    schema_version: 1,
    started_at: started,
    completed_at: started,
    git_sha: await gitSha(),
    documentation_revision: "0".repeat(64),
    pipeline_digest: checksumJson({ mode, pipeline: "pre-grounding" }),
    dataset_version: "1.0.0",
    split: "baseline",
    status: "rejected",
    aggregate: emptyAggregate(),
    case_results: [],
    gate_results: [
      {
        gate: "response_quality",
        status: "fail",
        evidence: "No approved corpus or grounded evaluation exists.",
      },
      {
        gate: "ui_runtime_evidence",
        status: "blocked",
        evidence: "Feature 006 browser/container evidence remains incomplete.",
      },
      {
        gate: "agentic_behavior",
        status: "fail",
        evidence: "No intent or workflow policy exists.",
      },
      {
        gate: "production_release",
        status: "blocked",
        evidence: "Next.js 14 and Liara staging evidence block release.",
      },
    ],
    artifact_checksums: {},
    reviewer: null,
  };
  await validateEvaluationReport(report);
  const output = argument("--output") ?? ".artifacts/liara/baseline";
  const path = await writeEvidenceJson(resolve(output), "report.json", report);
  process.stdout.write(`${path}\n`);
}

async function validateInputs(): Promise<void> {
  const casePath = resolve(argument("--cases") ?? "evals/liara/cases/v1.jsonl");
  if (await exists(casePath)) {
    const cases = await loadEvaluationCases(casePath);
    process.stdout.write(`validated ${cases.length} evaluation cases\n`);
  } else {
    process.stdout.write("evaluation schemas ready; no v1 case file yet\n");
  }
  const reportPath = argument("--report");
  if (reportPath) {
    await validateEvaluationReport(
      JSON.parse(await readFile(resolve(reportPath), "utf8")),
    );
    process.stdout.write("evaluation report valid\n");
  }
}

async function retrieval(): Promise<void> {
  const report = await runRetrievalEvaluation({
    casesPath: resolve(argument("--cases") ?? "evals/liara/cases/v1.jsonl"),
    passagesPath: resolve(
      argument("--passages") ?? ".artifacts/liara/index/passages.jsonl",
    ),
    split:
      (argument("--split") as "tuning" | "held_out" | undefined) ?? "held_out",
  });
  const output = resolve(argument("--output") ?? ".artifacts/liara/us1");
  const path = await writeEvidenceJson(output, "retrieval-report.json", report);
  process.stdout.write(`${path}\n`);
}

async function answers(): Promise<void> {
  const gatewayUrl =
    argument("--gateway-url") ?? process.env.AI_GATEWAY_EVAL_URL;
  const model = argument("--model") ?? process.env.AI_GATEWAY_MODEL_NAME;
  if (!gatewayUrl || !model) {
    throw new Error("answers requires --gateway-url and --model");
  }
  const report = await runAnswerEvaluation({
    casesPath: resolve(argument("--cases") ?? "evals/liara/cases/v1.jsonl"),
    gatewayUrl,
    model,
    split:
      (argument("--split") as "tuning" | "held_out" | undefined) ?? "held_out",
  });
  const output = resolve(argument("--output") ?? ".artifacts/liara/us1");
  const path = await writeEvidenceJson(output, "answer-report.json", report);
  process.stdout.write(`${path}\n`);
}

async function cost(): Promise<void> {
  const input = argument("--input");
  if (!input) throw new Error("cost requires --input");
  const report = await runCostEvaluation(resolve(input));
  const output = resolve(argument("--output") ?? ".artifacts/liara/us6");
  const path = await writeEvidenceJson(output, "report.json", report);
  process.stdout.write(`${path}\n`);
  if (!report.repeatedWorkload.passed) process.exitCode = 1;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "audit") return audit();
  if (command === "validate" || command === "evidence") {
    return validateInputs();
  }
  if (command === "retrieval") return retrieval();
  if (command === "answers") return answers();
  if (command === "cost") return cost();
  if (command === "security") {
    throw new Error(`${command} runner is not implemented yet`);
  }
  throw new Error("unknown Liara evaluation command");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "evaluation failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
