import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { runAnswerEvaluation } from "./answer-runner.ts";
import { runRetrievalEvaluation } from "./retrieval-runner.ts";

const revision = "a".repeat(64);
const evaluationCase = {
  id: "liara-direct-deploy",
  schema_version: 1,
  dataset_version: "1.0.0",
  split: "held_out",
  documentation_revision: revision,
  messages: [{ role: "user", content: "docker deploy" }],
  language: "en",
  category: "direct",
  difficulty: "simple",
  expected_intent: "direct",
  expected_sources: [{ url: "https://docs.liara.ir/paas/docker/" }],
  required_facts: ["liara deploy"],
  required_cautions: [],
  forbidden_claims: ["account access"],
  security_tags: [],
  critical_failures: ["unsupported fact"],
};

async function fixtures(): Promise<{
  casesPath: string;
  passagesPath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "liara-eval-"));
  const casesPath = join(directory, "cases.jsonl");
  const passagesPath = join(directory, "passages.jsonl");
  await writeFile(casesPath, `${JSON.stringify(evaluationCase)}\n`);
  await writeFile(
    passagesPath,
    `${JSON.stringify({
      id: "p1",
      canonicalUrl: "https://docs.liara.ir/paas/docker/",
      title: "Docker deploy",
      normalizedContent: "docker deploy with liara deploy",
      headingPath: ["Deploy"],
    })}\n`,
  );
  return { casesPath, passagesPath };
}

describe("Liara evaluation runners", () => {
  it("reports deterministic retrieval recall, rank, relevance, and destination gates", async () => {
    const paths = await fixtures();
    const report = await runRetrievalEvaluation({
      ...paths,
      split: "held_out",
    });
    expect(report.case_count).toBe(1);
    expect(report.aggregate).toEqual(
      expect.objectContaining({
        recall_at_8: 1,
        mrr: 1,
        ndcg_at_8: 1,
        destination_validity: 1,
      }),
    );
  });

  it("reports answer facts, citation adjacency, intent, revision, and human-review need", async () => {
    const { casesPath } = await fixtures();
    const report = await runAnswerEvaluation({
      casesPath,
      gatewayUrl: "https://gateway.example",
      model: "liara-assistant",
      split: "held_out",
      fetchImpl: async () =>
        Response.json({
          choices: [
            {
              message: {
                content:
                  "Run liara deploy [۱](https://docs.liara.ir/paas/docker/).",
              },
            },
          ],
          x_liara: {
            documentation_revision: revision,
            intent: { kind: "direct" },
            citations: [{ url: "https://docs.liara.ir/paas/docker/" }],
          },
        }),
    });
    expect(report.aggregate).toEqual(
      expect.objectContaining({ deterministic_acceptance: 1 }),
    );
    expect(report.human_rubric).toEqual(
      expect.objectContaining({ required: true }),
    );
  });
});
