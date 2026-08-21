import { beforeEach, describe, expect, it } from "vitest";

import { sha256, type SourcePassage } from "./chunker.ts";
import type { CorpusManifest } from "./manifest.ts";
import { MeilisearchPublisher } from "./meilisearch.ts";

const revision = "a".repeat(64);
const contentHash = "1".repeat(64);
const manifest: CorpusManifest = {
  revision,
  upstream_revision: "abcdef1",
  schema_version: 1,
  chunker_version: "section-v1",
  embedder_revision_digest: "b".repeat(64),
  aggregate_checksum: sha256(["paas/deploy.md", contentHash].join("\0")),
  page_count: 1,
  chunk_count: 1,
  built_at: "2026-08-21T00:00:00.000Z",
  status: "building",
  index_uid: `liara_docs_${revision.slice(0, 16)}`,
  route_inventory_checksum: "d".repeat(64),
  policy_digest: "e".repeat(64),
};
const passage = {
  id: "f".repeat(64),
  revision,
  sourcePath: "paas/deploy.md",
  canonicalUrl: "https://docs.liara.ir/paas/deploy/",
  verifiedAnchor: "install",
  title: "Deploy",
  headingPath: ["Deploy"],
  serviceTags: ["paas"],
  language: "mixed",
  content: "Deploy safely",
  normalizedContent: "deploy safely",
  codeLanguages: [],
  tokenEstimate: 3,
  contentHash,
} satisfies SourcePassage;

describe("atomic Meilisearch publication", () => {
  let requests: Array<{ method: string; path: string; body: unknown }>;
  let documentCount: number;
  let fakeFetch: typeof fetch;

  beforeEach(() => {
    requests = [];
    documentCount = 1;
    fakeFetch = async (input, init) => {
      const url = new URL(String(input));
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : null;
      requests.push({
        method: init?.method ?? "GET",
        path: `${url.pathname}${url.search}`,
        body,
      });
      if (url.pathname.endsWith("/stats")) {
        return Response.json({ numberOfDocuments: documentCount });
      }
      if (url.pathname.startsWith("/tasks/")) {
        return Response.json({ status: "succeeded" });
      }
      return Response.json({ taskUid: requests.length }, { status: 202 });
    };
  });

  const publisher = () =>
    new MeilisearchPublisher({
      baseUrl: "http://meili.test",
      apiKey: "test-key",
      pollIntervalMs: 0,
      fetchImpl: fakeFetch,
    });

  it("creates a revision candidate, pins settings, uploads documents, and verifies counts", async () => {
    await publisher().publishCandidate(manifest, [passage]);
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual(
      expect.arrayContaining([
        "POST /indexes",
        `PATCH /indexes/${manifest.index_uid}/settings`,
        `POST /indexes/${manifest.index_uid}/documents?primaryKey=id`,
        `GET /indexes/${manifest.index_uid}/stats`,
      ]),
    );
    expect(
      requests.find(({ path }) => path.includes("/documents?"))?.body,
    ).toEqual([expect.objectContaining({ id: passage.id, revision })]);
  });

  it("fails publication before activation when indexed counts mismatch", async () => {
    documentCount = 0;
    await expect(
      publisher().publishCandidate(manifest, [passage]),
    ).rejects.toThrow(/document count mismatch/);
    expect(requests.some(({ path }) => path === "/swap-indexes")).toBe(false);
  });

  it("refreshes an existing revision candidate idempotently", async () => {
    const baseFetch = fakeFetch;
    fakeFetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/indexes" && init?.method === "POST") {
        requests.push({ method: "POST", path: "/indexes", body: null });
        return Response.json({ message: "already exists" }, { status: 409 });
      }
      return baseFetch(input, init);
    };

    await publisher().publishCandidate(manifest, [passage]);

    expect(
      requests.some(({ path }) => path.includes("/documents?primaryKey=id")),
    ).toBe(true);
  });

  it("waits through processing states until the bounded task completes", async () => {
    let polls = 0;
    const baseFetch = fakeFetch;
    fakeFetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.startsWith("/tasks/") && polls++ < 2) {
        return Response.json({ status: "processing" });
      }
      return baseFetch(input, init);
    };

    await publisher().publishCandidate(manifest, [passage]);

    expect(polls).toBeGreaterThanOrEqual(3);
  });

  it("rejects aggregate or revision mismatch before contacting the index", async () => {
    await expect(
      publisher().publishCandidate(
        { ...manifest, aggregate_checksum: "0".repeat(64) },
        [passage],
      ),
    ).rejects.toThrow(/checksum mismatch/);
    await expect(
      publisher().publishCandidate(manifest, [
        { ...passage, revision: "9".repeat(64) },
      ]),
    ).rejects.toThrow(/revision mismatch/);
    expect(requests).toEqual([]);
  });

  it("atomically activates and rolls back compatible candidates", async () => {
    await publisher().activate(manifest.index_uid);
    await publisher().rollback(manifest.index_uid);
    const swaps = requests.filter(({ path }) => path === "/swap-indexes");
    expect(swaps).toHaveLength(2);
    expect(swaps[0]?.body).toEqual([
      { indexes: ["liara_docs_active", manifest.index_uid] },
    ]);
  });
});
