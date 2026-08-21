import { readFile } from "node:fs/promises";

import { normalizeForSearch } from "../liara-index/corpus.ts";
import { loadEvaluationCases } from "./evaluation-io.ts";

type Passage = {
  id: string;
  canonicalUrl: string;
  title: string;
  normalizedContent: string;
  headingPath: string[];
};

type RetrievalCaseResult = {
  case_id: string;
  expected_count: number;
  retrieved_count: number;
  recall_at_8: number;
  reciprocal_rank: number;
  ndcg_at_8: number;
  irrelevant_context_rate: number;
  destination_validity: number;
};

const terms = (value: string): Set<string> =>
  new Set(
    normalizeForSearch(value)
      .split(/[^\p{L}\p{N}_.:/-]+/u)
      .filter((term) => term.length > 1),
  );

function score(query: Set<string>, document: Set<string>): number {
  let overlap = 0;
  for (const term of query) if (document.has(term)) overlap += 1;
  return overlap / Math.sqrt(Math.max(1, query.size * document.size));
}

function dcg(relevance: number[]): number {
  return relevance.reduce(
    (total, value, index) => total + value / Math.log2(index + 2),
    0,
  );
}

const mean = (values: number[]): number =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

export async function runRetrievalEvaluation(input: {
  casesPath: string;
  passagesPath: string;
  split?: "tuning" | "held_out";
}): Promise<Record<string, unknown>> {
  const cases = (await loadEvaluationCases(input.casesPath)).filter(
    (item) => !input.split || item.split === input.split,
  );
  const passages = (await readFile(input.passagesPath, "utf8"))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Passage);
  if (!passages.length) throw new Error("retrieval corpus is empty");
  const indexedPassages = passages.map((passage) => ({
    passage,
    terms: terms(
      `${passage.title} ${passage.headingPath.join(" ")} ${passage.normalizedContent}`,
    ),
  }));

  const caseResults: RetrievalCaseResult[] = cases.map((item) => {
    const messages = item.messages as Array<{ role: string; content: string }>;
    const query = terms(messages.at(-1)?.content ?? "");
    const ranked = indexedPassages
      .map(({ passage, terms: documentTerms }) => ({
        passage,
        score: score(query, documentTerms),
      }))
      .filter((entry) => entry.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.passage.id.localeCompare(right.passage.id),
      )
      .slice(0, 8);
    const expected = new Set(
      (item.expected_sources as Array<{ url: string }>).map(({ url }) => url),
    );
    const relevance = ranked.map(({ passage }) =>
      expected.has(passage.canonicalUrl) ? 1 : 0,
    );
    const relevant = relevance.reduce<number>((sum, value) => sum + value, 0);
    const first = relevance.indexOf(1);
    const ideal = Array.from({ length: Math.min(8, expected.size) }, () => 1);
    return {
      case_id: String(item.id),
      expected_count: expected.size,
      retrieved_count: ranked.length,
      recall_at_8: expected.size ? relevant / expected.size : 1,
      reciprocal_rank: first >= 0 ? 1 / (first + 1) : expected.size ? 0 : 1,
      ndcg_at_8: expected.size ? dcg(relevance) / Math.max(dcg(ideal), 1) : 1,
      irrelevant_context_rate: ranked.length
        ? ranked.filter(
            ({ passage }) =>
              expected.size && !expected.has(passage.canonicalUrl),
          ).length / ranked.length
        : 0,
      destination_validity: ranked.every(({ passage }) =>
        passage.canonicalUrl.startsWith("https://docs.liara.ir/"),
      )
        ? 1
        : 0,
    };
  });
  return {
    schema_version: 1,
    split: input.split ?? "all",
    case_count: caseResults.length,
    aggregate: {
      recall_at_8: mean(caseResults.map((item) => item.recall_at_8)),
      mrr: mean(caseResults.map((item) => item.reciprocal_rank)),
      ndcg_at_8: mean(caseResults.map((item) => item.ndcg_at_8)),
      irrelevant_context_rate: mean(
        caseResults.map((item) => item.irrelevant_context_rate),
      ),
      destination_validity: mean(
        caseResults.map((item) => item.destination_validity),
      ),
    },
    case_results: caseResults,
  };
}
