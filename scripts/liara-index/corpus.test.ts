import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  discoverCorpus,
  normalizeForSearch,
  parseCorpusPage,
} from "./corpus.ts";
import { chunkCorpusPage } from "./chunker.ts";
import { buildManifest } from "./manifest.ts";

const revision = "a".repeat(64);

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "liara-corpus-"));
  mkdirSync(join(root, "paas"), { recursive: true });
  writeFileSync(
    join(root, "paas", "deploy.md"),
    "\ufeffOriginal link: https://docs.liara.ir/paas/deploy/\n\n# استقرار برنامه\n\n## پیش‌نیازها\n\nمتن فارسی ي ك با `liara deploy`.\n\n## نمونه\n\n```bash\nliara deploy --app demo\n```\n",
  );
  return root;
}

describe("deterministic Liara corpus", () => {
  it("discovers sorted Markdown files and parses approved canonical metadata", () => {
    const root = fixtureRoot();
    const paths = discoverCorpus(root);
    expect(paths.map((entry) => entry.sourcePath)).toEqual(["paas/deploy.md"]);

    const page = parseCorpusPage(paths[0]!);
    expect(page.canonicalUrl).toBe("https://docs.liara.ir/paas/deploy/");
    expect(page.title).toBe("استقرار برنامه");
    expect(page.sections.map((section) => section.headingPath)).toContainEqual([
      "استقرار برنامه",
      "پیش‌نیازها",
    ]);
  });

  it("normalizes Persian variants without damaging technical identifiers", () => {
    expect(normalizeForSearch("ي ك LIARA_API_KEY  foo/bar")).toBe(
      "ی ک liara_api_key foo/bar",
    );
  });

  it("rejects non-official, credential-bearing, and malformed source headers", () => {
    const root = fixtureRoot();
    const entry = discoverCorpus(root)[0]!;
    expect(() =>
      parseCorpusPage({
        ...entry,
        content: entry.content.replace("docs.liara.ir", "evil.example"),
      }),
    ).toThrow(/official canonical URL/);
    expect(() =>
      parseCorpusPage({ ...entry, content: "# missing source" }),
    ).toThrow(/Original link/);
  });

  it("uses the first heading for legacy cleaned pages that have no H1", () => {
    const page = parseCorpusPage({
      absolutePath: "/fixture/legacy.md",
      sourcePath: "legacy.md",
      content:
        "Original link: https://docs.liara.ir/legacy/\n\n## Legacy heading\n\nContent",
    });
    expect(page.title).toBe("Legacy heading");
  });

  it("keeps code fences intact and produces stable passage IDs", () => {
    const page = parseCorpusPage(discoverCorpus(fixtureRoot())[0]!);
    const first = chunkCorpusPage(page, { revision, targetTokens: 80 });
    const second = chunkCorpusPage(page, { revision, targetTokens: 80 });
    expect(first).toEqual(second);
    expect(first.some((passage) => passage.content.includes("```bash"))).toBe(
      true,
    );
    expect(first.every((passage) => /^[a-f0-9]{64}$/.test(passage.id))).toBe(
      true,
    );
    expect(new Set(first.map((passage) => passage.contentHash)).size).toBe(
      first.length,
    );
  });

  it("builds a repeatable revision/checksum independent of evidence time", () => {
    const page = parseCorpusPage(discoverCorpus(fixtureRoot())[0]!);
    const passages = chunkCorpusPage(page, { revision, targetTokens: 80 });
    const one = buildManifest({
      upstreamRevision: "abcdef1",
      passages,
      pageCount: 1,
      builtAt: "2026-08-21T00:00:00.000Z",
    });
    const two = buildManifest({
      upstreamRevision: "abcdef1",
      passages,
      pageCount: 1,
      builtAt: "2026-08-22T00:00:00.000Z",
    });
    expect(one.revision).toBe(two.revision);
    expect(one.aggregate_checksum).toBe(two.aggregate_checksum);
    expect(one.built_at).not.toBe(two.built_at);
  });
});
