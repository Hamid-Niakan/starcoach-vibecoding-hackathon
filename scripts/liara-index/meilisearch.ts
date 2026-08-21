import { sha256, type SourcePassage } from "./chunker.ts";
import type { CorpusManifest } from "./manifest.ts";

type TaskResponse = { taskUid: number };
type TaskStatus = {
  status: "enqueued" | "processing" | "succeeded" | "failed";
  error?: unknown;
};

export type MeilisearchPublisherOptions = {
  baseUrl: string;
  apiKey: string;
  activeIndexUid?: string;
  timeoutMs?: number;
  taskTimeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: typeof fetch;
};

export class MeilisearchPublisher {
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #activeIndexUid: string;
  readonly #timeoutMs: number;
  readonly #taskTimeoutMs: number;
  readonly #pollIntervalMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: MeilisearchPublisherOptions) {
    const url = new URL(options.baseUrl);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
      throw new Error("Invalid Meilisearch URL");
    }
    if (!options.apiKey) throw new Error("Meilisearch API key is required");
    this.#baseUrl = url.toString().replace(/\/$/, "");
    this.#apiKey = options.apiKey;
    this.#activeIndexUid = options.activeIndexUid ?? "liara_docs_active";
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#taskTimeoutMs = options.taskTimeoutMs ?? 600_000;
    this.#pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const signal = AbortSignal.timeout(this.#timeoutMs);
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      ...init,
      signal,
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok)
      throw new Error(`Meilisearch request failed (${response.status})`);
    return (await response.json()) as T;
  }

  async #wait(task: TaskResponse): Promise<void> {
    const deadline = Date.now() + this.#taskTimeoutMs;
    while (Date.now() < deadline) {
      const status = await this.#request<TaskStatus>(`/tasks/${task.taskUid}`);
      if (status.status === "succeeded") return;
      if (status.status === "failed")
        throw new Error("Meilisearch task failed");
      await new Promise((resolve) => setTimeout(resolve, this.#pollIntervalMs));
    }
    throw new Error("Meilisearch task timed out");
  }

  async publishCandidate(
    manifest: CorpusManifest,
    passages: readonly SourcePassage[],
  ): Promise<void> {
    if (manifest.status !== "building" && manifest.status !== "validating") {
      throw new Error("Only building or validating revisions may be published");
    }
    if (passages.length !== manifest.chunk_count) {
      throw new Error("Candidate document count mismatch");
    }
    const aggregate = passages
      .map((passage) => `${passage.sourcePath}\0${passage.contentHash}`)
      .sort()
      .join("\n");
    if (sha256(aggregate) !== manifest.aggregate_checksum) {
      throw new Error("Candidate aggregate checksum mismatch");
    }
    if (passages.some((passage) => passage.revision !== manifest.revision)) {
      throw new Error("Candidate passage revision mismatch");
    }

    const createResponse = await this.#fetch(`${this.#baseUrl}/indexes`, {
      method: "POST",
      signal: AbortSignal.timeout(this.#timeoutMs),
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ uid: manifest.index_uid, primaryKey: "id" }),
    });
    if (createResponse.ok) {
      await this.#wait((await createResponse.json()) as TaskResponse);
    } else if (createResponse.status !== 409) {
      throw new Error(`Meilisearch request failed (${createResponse.status})`);
    }
    await this.#wait(
      await this.#request<TaskResponse>(
        `/indexes/${manifest.index_uid}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify({
            searchableAttributes: [
              "normalizedContent",
              "content",
              "title",
              "headingPath",
            ],
            filterableAttributes: ["revision", "serviceTags", "language"],
            displayedAttributes: [
              "id",
              "revision",
              "canonicalUrl",
              "verifiedAnchor",
              "title",
              "headingPath",
              "serviceTags",
              "language",
              "content",
              "tokenEstimate",
              "contentHash",
            ],
            embedders: {
              default: {
                source: "huggingFace",
                model: "BAAI/bge-m3",
                documentTemplate:
                  "A Liara documentation passage titled {{doc.title}}: {{doc.normalizedContent}}",
              },
            },
            rankingRules: [
              "words",
              "typo",
              "proximity",
              "attribute",
              "sort",
              "exactness",
            ],
          }),
        },
      ),
    );
    await this.#wait(
      await this.#request<TaskResponse>(
        `/indexes/${manifest.index_uid}/documents?primaryKey=id`,
        { method: "POST", body: JSON.stringify(passages) },
      ),
    );
    const stats = await this.#request<{ numberOfDocuments: number }>(
      `/indexes/${manifest.index_uid}/stats`,
    );
    if (stats.numberOfDocuments !== manifest.chunk_count) {
      throw new Error("Candidate document count mismatch after indexing");
    }
  }

  async activate(candidateIndexUid: string): Promise<void> {
    this.#assertIndexUid(candidateIndexUid);
    await this.#swap(candidateIndexUid);
  }

  async rollback(previousIndexUid: string): Promise<void> {
    this.#assertIndexUid(previousIndexUid);
    await this.#swap(previousIndexUid);
  }

  async #swap(otherIndexUid: string): Promise<void> {
    await this.#wait(
      await this.#request<TaskResponse>("/swap-indexes", {
        method: "POST",
        body: JSON.stringify([
          { indexes: [this.#activeIndexUid, otherIndexUid] },
        ]),
      }),
    );
  }

  #assertIndexUid(value: string): void {
    if (!/^liara_docs_[a-f0-9]{12,64}$/.test(value)) {
      throw new Error("Invalid compatible Liara index UID");
    }
  }
}
