import { sha256, type SourcePassage } from "./chunker.ts";

export type CorpusManifest = {
  revision: string;
  upstream_revision: string;
  schema_version: 1;
  chunker_version: string;
  embedder_revision_digest: string;
  aggregate_checksum: string;
  page_count: number;
  chunk_count: number;
  built_at: string;
  status: "building" | "validating" | "active" | "superseded" | "failed";
  index_uid: string;
  route_inventory_checksum: string;
  policy_digest: string;
};

export function buildManifest(input: {
  upstreamRevision: string;
  passages: readonly SourcePassage[];
  pageCount: number;
  builtAt?: string;
  chunkerVersion?: string;
  embedderRevisionDigest?: string;
  policyDigest?: string;
}): CorpusManifest {
  if (!/^[a-f0-9]{7,40}$/.test(input.upstreamRevision)) {
    throw new Error("Invalid upstream revision");
  }
  if (input.pageCount < 1 || input.passages.length < 1) {
    throw new Error("A corpus manifest requires pages and passages");
  }
  const aggregate = input.passages
    .map((passage) => `${passage.sourcePath}\0${passage.contentHash}`)
    .sort()
    .join("\n");
  const aggregateChecksum = sha256(aggregate);
  const routeChecksum = sha256(
    [...new Set(input.passages.map((passage) => passage.canonicalUrl))]
      .sort()
      .join("\n"),
  );
  const chunkerVersion = input.chunkerVersion ?? "section-v1";
  const embedderRevisionDigest =
    input.embedderRevisionDigest ?? sha256("BAAI/bge-m3");
  const policyDigest = input.policyDigest ?? sha256("liara-retrieval-v1");
  const revision = sha256(
    [
      input.upstreamRevision,
      chunkerVersion,
      embedderRevisionDigest,
      aggregateChecksum,
      routeChecksum,
      policyDigest,
      String(input.pageCount),
      String(input.passages.length),
    ].join("\0"),
  );
  return {
    revision,
    upstream_revision: input.upstreamRevision,
    schema_version: 1,
    chunker_version: chunkerVersion,
    embedder_revision_digest: embedderRevisionDigest,
    aggregate_checksum: aggregateChecksum,
    page_count: input.pageCount,
    chunk_count: input.passages.length,
    built_at: input.builtAt ?? new Date().toISOString(),
    status: "building",
    index_uid: `liara_docs_${revision.slice(0, 16)}`,
    route_inventory_checksum: routeChecksum,
    policy_digest: policyDigest,
  };
}
