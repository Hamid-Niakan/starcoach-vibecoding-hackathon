import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  chatCompletionSchema,
  chatCompletionChunkResponseSchema,
  liaraAssistantMetadataV1Schema,
  liaraTerminalChunkSchema,
  modelListSchema,
  openAIErrorResponseSchema,
  readinessSchema,
} from "../../packages/contracts/src/index.js";

export interface StagingAcceptanceOptions {
  gatewayUrl: string;
  docsUrl: string;
  model: string;
  output?: string;
  fetchImpl?: typeof fetch;
}

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

function endpoint(base: string, path: string): string {
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function runStagingAcceptance(
  options: StagingAcceptanceOptions,
): Promise<{
  passed: boolean;
  checks: CheckResult[];
  viewportCommands: string[];
}> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const checks: CheckResult[] = [];
  const record = async (name: string, action: () => Promise<string>) => {
    try {
      checks.push({ name, passed: true, detail: await action() });
    } catch (error) {
      checks.push({
        name,
        passed: false,
        detail: error instanceof Error ? error.message : "unknown failure",
      });
    }
  };

  await record("gateway_readiness", async () => {
    readinessSchema.parse(
      await getJson(
        fetchImpl,
        endpoint(options.gatewayUrl, "health/readiness"),
      ),
    );
    return "schema-valid readiness";
  });
  await record("model_alias", async () => {
    const models = modelListSchema.parse(
      await getJson(fetchImpl, endpoint(options.gatewayUrl, "v1/models")),
    );
    if (models.data.length !== 1 || models.data[0]?.id !== options.model) {
      throw new Error("stable public model alias mismatch");
    }
    return "one stable public model";
  });
  await record("grounded_non_stream", async () => {
    const response = await fetchImpl(
      endpoint(options.gatewayUrl, "v1/chat/completions"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: options.model,
          stream: false,
          messages: [
            { role: "user", content: "چطور یک برنامه را در لیارا مستقر کنم؟" },
          ],
        }),
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const completion = chatCompletionSchema.parse(await response.json());
    liaraAssistantMetadataV1Schema.parse(completion.x_liara);
    return "grounded metadata and citations validated";
  });
  await record("grounded_stream", async () => {
    const response = await fetchImpl(
      endpoint(options.gatewayUrl, "v1/chat/completions"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: options.model,
          stream: true,
          messages: [{ role: "user", content: "روش مشاهده لاگ‌ها چیست؟" }],
        }),
      },
    );
    if (!response.ok || !response.body)
      throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > 8 * 1024 * 1024) {
      throw new Error("stream exceeded staging acceptance limit");
    }
    const events = body
      .split(/\r?\n\r?\n/)
      .map((event) =>
        event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n"),
      )
      .filter(Boolean);
    if (events.at(-1) !== "[DONE]") throw new Error("terminal DONE missing");
    let metadataCount = 0;
    for (const event of events.slice(0, -1)) {
      const value: unknown = JSON.parse(event);
      if (liaraTerminalChunkSchema.safeParse(value).success) metadataCount += 1;
      else chatCompletionChunkResponseSchema.parse(value);
    }
    if (metadataCount !== 1) {
      throw new Error(
        "exactly one terminal grounded metadata event is required",
      );
    }
    return "bounded SSE completed with terminal metadata";
  });
  await record("sanitized_failure", async () => {
    const response = await fetchImpl(
      endpoint(options.gatewayUrl, "v1/chat/completions"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "invalid-public-model",
          messages: [{ role: "user", content: "test" }],
        }),
      },
    );
    if (response.status !== 400 || !response.headers.get("x-request-id")) {
      throw new Error("sanitized failure status/request ID mismatch");
    }
    openAIErrorResponseSchema.parse(await response.json());
    return "schema-valid error with support request ID";
  });
  await record("payload_limit", async () => {
    const response = await fetchImpl(
      endpoint(options.gatewayUrl, "v1/chat/completions"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: options.model,
          messages: [{ role: "user", content: "x".repeat(65_537) }],
        }),
      },
    );
    if (![400, 413].includes(response.status)) {
      throw new Error(
        `oversized message unexpectedly returned HTTP ${response.status}`,
      );
    }
    openAIErrorResponseSchema.parse(await response.json());
    return "oversized message rejected before generation";
  });
  await record("docs_health", async () => {
    const response = await fetchImpl(options.docsUrl, { redirect: "follow" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return "docs app reachable";
  });

  const viewportCommands = [
    `LIARA_E2E_BASE_URL=${options.docsUrl} playwright test tests/e2e/liara-quality-ux.spec.ts --project=chromium-desktop`,
    `LIARA_E2E_BASE_URL=${options.docsUrl} playwright test tests/e2e/liara-quality-ux.spec.ts --project=chromium-mobile`,
  ];
  const report = {
    passed: checks.every((check) => check.passed),
    checks,
    viewportCommands,
  };
  if (options.output) {
    await writeFile(
      resolve(options.output),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
  return report;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const gatewayUrl = argument("--gateway-url");
  const docsUrl = argument("--docs-url");
  const model = argument("--model");
  if (!gatewayUrl || !docsUrl || !model) {
    throw new Error("--gateway-url, --docs-url, and --model are required");
  }
  const report = await runStagingAcceptance({
    gatewayUrl,
    docsUrl,
    model,
    output: argument("--output"),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("staging-acceptance.ts")) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "staging acceptance failed"}\n`,
    );
    process.exitCode = 1;
  });
}
