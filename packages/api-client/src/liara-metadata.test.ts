import { describe, expect, it, vi } from "vitest";

import { GatewayClient } from "./client.js";

const requestId = "13df274a-2e13-421d-8ec7-e77a528aaa6b";
const revision = "a".repeat(64);
const metadata = {
  schema_version: 1 as const,
  documentation_revision: revision,
  intent: { kind: "direct" as const, missing_fields: [], topic_changed: false },
  answer_path: "generated" as const,
  citations: [
    {
      id: "c1",
      marker: 1,
      passage_id: "passage-123456789",
      title: "استقرار",
      url: "https://docs.liara.ir/paas/docker/",
      documentation_revision: revision,
      validation: "valid" as const,
    },
  ],
  next_steps: [],
  reuse: "none" as const,
};

const ordinary = (extra: Record<string, unknown> = {}) => ({
  id: "chatcmpl-1",
  object: "chat.completion.chunk",
  created: 1,
  model: "liara-assistant",
  choices: [{ index: 0, delta: { content: "پاسخ [۱]" }, finish_reason: null }],
  ...extra,
});
const terminal = (value: unknown = metadata) => ({
  id: "chatcmpl-1",
  object: "chat.completion.chunk",
  created: 1,
  model: "liara-assistant",
  choices: [],
  x_liara: value,
});

function sse(events: unknown[], done = true): Response {
  const body =
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
    (done ? "data: [DONE]\n\n" : "");
  return new Response(body, {
    headers: { "content-type": "text/event-stream", "x-request-id": requestId },
  });
}

async function collect(response: Response, signal?: AbortSignal) {
  const client = new GatewayClient("https://gateway.example.com", {
    fetch: vi.fn(async () => response),
  });
  const values = [];
  for await (const event of client.streamLiara(
    {
      model: "liara-assistant",
      messages: [{ role: "user", content: "سلام" }],
      stream: true,
    },
    signal,
  ))
    values.push(event);
  return values;
}

describe("Liara terminal stream metadata", () => {
  it("extracts one strict terminal object and keeps the exposed request ID", async () => {
    const values = await collect(sse([ordinary(), terminal()]));
    expect(values).toEqual([
      {
        type: "chunk",
        chunk: expect.objectContaining({ choices: expect.any(Array) }),
        requestId,
      },
      { type: "metadata", metadata, requestId },
    ]);
  });

  it("rejects missing or duplicate terminal metadata", async () => {
    await expect(collect(sse([ordinary()]))).rejects.toMatchObject({
      code: "missing_liara_metadata",
      requestId,
    });
    await expect(
      collect(sse([ordinary(), terminal(), terminal()])),
    ).rejects.toMatchObject({ code: "duplicate_liara_metadata", requestId });
  });

  it("rejects invalid and non-approved citation destinations", async () => {
    const invalid = {
      ...metadata,
      citations: [
        { ...metadata.citations[0], url: "https://evil.example/source" },
      ],
    };
    await expect(
      collect(sse([ordinary(), terminal(invalid)])),
    ).rejects.toMatchObject({ code: "invalid_liara_metadata", requestId });
  });

  it("tolerates unrelated OpenAI extensions on ordinary chunks", async () => {
    await expect(
      collect(
        sse([ordinary({ provider_extension: { safe: true } }), terminal()]),
      ),
    ).resolves.toHaveLength(2);
  });

  it("propagates cancellation without converting it into a protocol error", async () => {
    const controller = new AbortController();
    const response = new Response(new ReadableStream({ start() {} }), {
      headers: { "x-request-id": requestId },
    });
    const pending = collect(response, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
