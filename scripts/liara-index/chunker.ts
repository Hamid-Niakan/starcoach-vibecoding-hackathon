import { createHash } from "node:crypto";

import type { CorpusPage, CorpusSection } from "./corpus.ts";
import { normalizeForSearch } from "./corpus.ts";

export type SourcePassage = {
  id: string;
  revision: string;
  sourcePath: string;
  canonicalUrl: string;
  verifiedAnchor: string | null;
  title: string;
  headingPath: string[];
  serviceTags: string[];
  language: "fa" | "en" | "mixed" | "unknown";
  content: string;
  normalizedContent: string;
  codeLanguages: string[];
  tokenEstimate: number;
  contentHash: string;
};

export type ChunkOptions = {
  revision: string;
  targetTokens?: number;
  maximumTokens?: number;
  overlapTokens?: number;
};

export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const estimateTokens = (value: string): number =>
  Math.max(1, Math.ceil([...value].length / 4));

function detectLanguage(value: string): SourcePassage["language"] {
  const persian = (value.match(/[\u0600-\u06ff]/g) ?? []).length;
  const latin = (value.match(/[A-Za-z]/g) ?? []).length;
  if (persian && latin) return "mixed";
  if (persian) return "fa";
  if (latin) return "en";
  return "unknown";
}

function serviceTags(page: CorpusPage): string[] {
  const segment = new URL(page.canonicalUrl).pathname
    .split("/")
    .filter(Boolean)[0];
  return segment ? [segment.toLocaleLowerCase("en-US")] : [];
}

function codeLanguages(value: string): string[] {
  return [...value.matchAll(/^```([A-Za-z0-9_+.-]*)/gm)]
    .map((match) => match[1] || "text")
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 8);
}

function hardWrap(value: string, tokenLimit: number): string[] {
  const characterLimit = tokenLimit * 4;
  const pieces: string[] = [];
  let current = "";
  for (const line of value.split("\n")) {
    const segments =
      line.length > characterLimit
        ? Array.from(
            { length: Math.ceil(line.length / characterLimit) },
            (_, index) =>
              line.slice(index * characterLimit, (index + 1) * characterLimit),
          )
        : [line];
    for (const segment of segments) {
      const candidate = current ? `${current}\n${segment}` : segment;
      if (current && estimateTokens(candidate) > tokenLimit) {
        pieces.push(current);
        current = segment;
      } else {
        current = candidate;
      }
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function expandBlock(
  block: string,
  targetTokens: number,
  maximumTokens: number,
): string[] {
  const fence =
    /^(?<open>```[^\n]*\n)(?<body>[\s\S]*?)(?<close>\n```\s*)$/.exec(block);
  if (fence?.groups) {
    if (estimateTokens(block) <= maximumTokens) return [block];
    const wrapperTokens = estimateTokens(
      `${fence.groups.open}${fence.groups.close}`,
    );
    return hardWrap(
      fence.groups.body,
      Math.max(1, maximumTokens - wrapperTokens),
    ).map((body) => `${fence.groups!.open}${body}${fence.groups!.close}`);
  }
  return estimateTokens(block) <= targetTokens
    ? [block]
    : hardWrap(block, targetTokens);
}

function splitSection(
  section: CorpusSection,
  targetTokens: number,
  maximumTokens: number,
  overlapTokens: number,
): string[] {
  if (estimateTokens(section.content) <= targetTokens) return [section.content];
  const blocks = section.content
    .split(/\n{2,}/)
    .filter(Boolean)
    .flatMap((block) => expandBlock(block, targetTokens, maximumTokens));
  const chunks: string[] = [];
  let current = "";
  let previousPlainBlock = "";
  for (const block of blocks) {
    const isFenced = /^```[\s\S]*\n```\s*$/.test(block);
    if (estimateTokens(block) > maximumTokens)
      throw new Error("Markdown block exceeds the passage token ceiling");
    const candidate = current ? `${current}\n\n${block}` : block;
    if (current && estimateTokens(candidate) > targetTokens) {
      chunks.push(current);
      const overlap =
        !isFenced && estimateTokens(previousPlainBlock) <= overlapTokens
          ? previousPlainBlock
          : "";
      current = overlap ? `${overlap}\n\n${block}` : block;
    } else {
      current = candidate;
    }
    if (!isFenced) previousPlainBlock = block;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function chunkCorpusPage(
  page: CorpusPage,
  options: ChunkOptions,
): SourcePassage[] {
  if (!/^[a-f0-9]{64}$/.test(options.revision))
    throw new Error("Invalid revision digest");
  const targetTokens = options.targetTokens ?? 500;
  const maximumTokens = options.maximumTokens ?? 1_200;
  const overlapTokens = options.overlapTokens ?? 80;
  if (targetTokens < 1 || maximumTokens < targetTokens || overlapTokens < 0) {
    throw new Error("Invalid chunk token limits");
  }
  const seen = new Set<string>();
  const passages: SourcePassage[] = [];
  for (const section of page.sections) {
    for (const content of splitSection(
      section,
      targetTokens,
      maximumTokens,
      overlapTokens,
    )) {
      const contentHash = sha256(content);
      if (seen.has(contentHash)) continue;
      seen.add(contentHash);
      const ordinal = passages.length;
      const identity = [
        options.revision,
        page.sourcePath,
        section.anchor ?? "",
        String(ordinal),
        contentHash,
      ].join("\0");
      passages.push({
        id: sha256(identity),
        revision: options.revision,
        sourcePath: page.sourcePath,
        canonicalUrl: page.canonicalUrl,
        verifiedAnchor: section.anchor,
        title: page.title,
        headingPath: section.headingPath.slice(0, 8),
        serviceTags: serviceTags(page),
        language: detectLanguage(content),
        content,
        normalizedContent: normalizeForSearch(content),
        codeLanguages: codeLanguages(content),
        tokenEstimate: estimateTokens(content),
        contentHash,
      });
    }
  }
  return passages;
}
