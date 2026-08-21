import { loadEvaluationCases } from "./evaluation-io.ts";

const mean = (values: number[]): number =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

export async function runAnswerEvaluation(input: {
  casesPath: string;
  gatewayUrl: string;
  model: string;
  split?: "tuning" | "held_out";
  fetchImpl?: typeof fetch;
}): Promise<Record<string, unknown>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const cases = (await loadEvaluationCases(input.casesPath)).filter(
    (item) => !input.split || item.split === input.split,
  );
  const results = [];
  for (const item of cases) {
    const response = await fetchImpl(
      `${input.gatewayUrl.replace(/\/$/, "")}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: input.model,
          messages: item.messages,
          stream: false,
        }),
      },
    );
    if (!response.ok) {
      results.push({
        case_id: item.id,
        accepted: 0,
        failure: `http_${response.status}`,
      });
      continue;
    }
    const body = (await response.json()) as Record<string, unknown>;
    const choices = body.choices as Array<{ message?: { content?: string } }>;
    const answer = choices?.[0]?.message?.content ?? "";
    const metadata = body.x_liara as
      | {
          intent?: { kind?: string };
          citations?: Array<{ url?: string }>;
          documentation_revision?: string;
        }
      | undefined;
    const required = item.required_facts as string[];
    const forbidden = item.forbidden_claims as string[];
    const citations = metadata?.citations ?? [];
    const expectedIntent = String(item.expected_intent);
    const requiredCoverage = required.length
      ? required.filter((fact) =>
          answer
            .toLocaleLowerCase("en-US")
            .includes(fact.toLocaleLowerCase("en-US")),
        ).length / required.length
      : 1;
    const forbiddenSafety = forbidden.every(
      (claim) =>
        !answer
          .toLocaleLowerCase("en-US")
          .includes(claim.toLocaleLowerCase("en-US")),
    )
      ? 1
      : 0;
    const destinationValidity = citations.every(({ url }) =>
      url?.startsWith("https://docs.liara.ir/"),
    )
      ? 1
      : 0;
    const citationAdjacency = citations.length
      ? /\[[۰-۹1-9][۰-۹0-9]*\]\(https:\/\/docs\.liara\.ir\//.test(answer)
        ? 1
        : 0
      : required.length
        ? 0
        : 1;
    const intentAccuracy = metadata?.intent?.kind === expectedIntent ? 1 : 0;
    const revisionMatch =
      metadata?.documentation_revision === item.documentation_revision ? 1 : 0;
    const accepted =
      requiredCoverage === 1 &&
      forbiddenSafety === 1 &&
      destinationValidity === 1 &&
      citationAdjacency === 1 &&
      intentAccuracy === 1 &&
      revisionMatch === 1
        ? 1
        : 0;
    results.push({
      case_id: item.id,
      accepted,
      required_fact_coverage: requiredCoverage,
      forbidden_claim_safety: forbiddenSafety,
      citation_destination_validity: destinationValidity,
      citation_adjacency: citationAdjacency,
      intent_accuracy: intentAccuracy,
      revision_match: revisionMatch,
      requires_human_review: true,
    });
  }
  return {
    schema_version: 1,
    split: input.split ?? "all",
    case_count: results.length,
    aggregate: {
      deterministic_acceptance: mean(
        results.map((item) => Number(item.accepted)),
      ),
      citation_destination_validity: mean(
        results.map((item) => Number(item.citation_destination_validity ?? 0)),
      ),
      intent_accuracy: mean(
        results.map((item) => Number(item.intent_accuracy ?? 0)),
      ),
    },
    human_rubric: {
      required: true,
      dimensions: [
        "correctness",
        "completeness",
        "relevance",
        "actionability",
        "citation_entailment",
        "uncertainty_handling",
        "language_clarity",
        "safety",
      ],
    },
    case_results: results,
  };
}
