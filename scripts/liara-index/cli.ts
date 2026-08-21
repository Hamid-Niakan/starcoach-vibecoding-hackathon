import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020.js";

import { chunkCorpusPage, type SourcePassage } from "./chunker.ts";
import { discoverCorpus, parseCorpusPage } from "./corpus.ts";
import { buildManifest, type CorpusManifest } from "./manifest.ts";
import { MeilisearchPublisher } from "./meilisearch.ts";

const args = process.argv.slice(2);
const command = args[0];

function argument(name: string, fallback?: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : fallback;
  if (!value) throw new Error(`Missing required argument ${name}`);
  return value;
}

function importedRevision(): string {
  const evidence = readFileSync(
    resolve("docs/architecture/liara-upstream.md"),
    "utf8",
  );
  const match = /Imported commit:\s*`([a-f0-9]{7,40})`/.exec(evidence);
  if (!match?.[1])
    throw new Error("Imported Liara upstream revision is not recorded");
  return match[1];
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function writeJsonl(
  path: string,
  values: readonly unknown[],
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${values.map((value) => JSON.stringify(value)).join("\n")}\n`,
    {
      mode: 0o600,
    },
  );
}

function buildPassages(
  source: string,
  upstreamRevision: string,
): {
  manifest: CorpusManifest;
  passages: SourcePassage[];
} {
  const pages = discoverCorpus(source).map(parseCorpusPage);
  if (pages.length === 0) throw new Error("Approved corpus is empty");
  const provisional = "0".repeat(64);
  const provisionalPassages = pages.flatMap((page) =>
    chunkCorpusPage(page, { revision: provisional }),
  );
  const manifest = buildManifest({
    upstreamRevision,
    passages: provisionalPassages,
    pageCount: pages.length,
  });
  const passages = pages.flatMap((page) =>
    chunkCorpusPage(page, { revision: manifest.revision }),
  );
  return { manifest, passages };
}

async function loadArtifacts(manifestPath: string): Promise<{
  manifest: CorpusManifest;
  passages: SourcePassage[];
}> {
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  ) as CorpusManifest;
  const passagesPath = resolve(dirname(manifestPath), "passages.jsonl");
  const passages = (await readFile(passagesPath, "utf8"))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SourcePassage);
  return { manifest, passages };
}

async function validate(manifestPath: string): Promise<{
  manifest: CorpusManifest;
  passages: SourcePassage[];
}> {
  const artifacts = await loadArtifacts(manifestPath);
  const schema = JSON.parse(
    await readFile(
      resolve(
        "specs/007-liara-assistant-quality/contracts/corpus-manifest.schema.json",
      ),
      "utf8",
    ),
  ) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validator = ajv.compile(schema);
  if (!validator(artifacts.manifest)) {
    throw new Error(
      `Invalid corpus manifest: ${ajv.errorsText(validator.errors)}`,
    );
  }
  if (
    artifacts.passages.length !== artifacts.manifest.chunk_count ||
    new Set(artifacts.passages.map(({ id }) => id)).size !==
      artifacts.passages.length ||
    artifacts.passages.some(
      ({ revision }) => revision !== artifacts.manifest.revision,
    )
  ) {
    throw new Error("Corpus passage count, identity, or revision mismatch");
  }
  return artifacts;
}

function publisher(): MeilisearchPublisher {
  const taskTimeoutMs = Number(
    process.env.AI_GATEWAY_MEILI_TASK_TIMEOUT_MS ?? "600000",
  );
  if (
    !Number.isSafeInteger(taskTimeoutMs) ||
    taskTimeoutMs < 1_000 ||
    taskTimeoutMs > 3_600_000
  ) {
    throw new Error("Invalid Meilisearch task timeout");
  }
  return new MeilisearchPublisher({
    baseUrl: process.env.AI_GATEWAY_MEILI_URL ?? "",
    apiKey: process.env.AI_GATEWAY_MEILI_API_KEY ?? "",
    activeIndexUid: process.env.AI_GATEWAY_LIARA_INDEX_UID,
    taskTimeoutMs,
  });
}

async function main(): Promise<void> {
  if (command === "build") {
    const source = resolve(argument("--source", "apps/liara-docs/public/llms"));
    const output = resolve(argument("--output", ".artifacts/liara/index"));
    const artifacts = buildPassages(
      source,
      argument("--upstream", importedRevision()),
    );
    await writeJson(resolve(output, "manifest.json"), artifacts.manifest);
    await writeJsonl(resolve(output, "passages.jsonl"), artifacts.passages);
    process.stdout.write(
      `${JSON.stringify({ revision: artifacts.manifest.revision, pages: artifacts.manifest.page_count, chunks: artifacts.manifest.chunk_count })}\n`,
    );
    return;
  }

  const manifestPath = resolve(
    argument("--manifest", ".artifacts/liara/index/manifest.json"),
  );
  const artifacts = await validate(manifestPath);
  if (command === "validate") {
    process.stdout.write(`${artifacts.manifest.revision}\n`);
  } else if (command === "publish") {
    await publisher().publishCandidate(artifacts.manifest, artifacts.passages);
  } else if (command === "activate") {
    await publisher().activate(artifacts.manifest.index_uid);
  } else if (command === "rollback") {
    await publisher().rollback(artifacts.manifest.index_uid);
  } else {
    throw new Error("Expected build, validate, publish, activate, or rollback");
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Liara index command failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
