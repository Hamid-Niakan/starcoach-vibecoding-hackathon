import { describe, expect, it } from "vitest";
import {
  chatCompletionChunkSchema,
  chatCompletionRequestSchema,
  chatCompletionSchema,
  modelListSchema,
  openAIErrorResponseSchema,
  usageSchema,
} from "./openai.js";

const publicModel = {
  id: "liara-docs",
  object: "model",
  created: 0,
  owned_by: "ai-gateway",
} as const;

describe("OpenAI consumer contracts", () => {
  it("accepts exactly one bounded public model", () => {
    expect(
      modelListSchema.parse({ object: "list", data: [publicModel] }),
    ).toEqual({
      object: "list",
      data: [publicModel],
    });

    expect(
      modelListSchema.safeParse({ object: "list", data: [] }).success,
    ).toBe(false);
    expect(
      modelListSchema.safeParse({
        object: "list",
        data: [publicModel, publicModel],
      }).success,
    ).toBe(false);
    expect(
      modelListSchema.safeParse({
        object: "list",
        data: [{ ...publicModel, owned_by: "protected-provider" }],
      }).success,
    ).toBe(false);
  });

  it("accepts the Liara completion request subset and rejects legacy or extra fields", () => {
    expect(
      chatCompletionRequestSchema.safeParse({
        model: publicModel.id,
        messages: [
          { role: "system", content: "Use the documentation." },
          { role: "user", content: "سلام" },
        ],
        stream: true,
        max_completion_tokens: 512,
      }).success,
    ).toBe(true);

    expect(
      chatCompletionRequestSchema.safeParse({
        model: publicModel.id,
        messages: [{ role: "tool", content: "legacy" }],
      }).success,
    ).toBe(false);
    expect(
      chatCompletionRequestSchema.safeParse({
        model: publicModel.id,
        messages: [{ role: "user", content: "hello" }],
        conversationId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });

  it("validates non-streaming completions while preserving compatible response extensions", () => {
    const result = chatCompletionSchema.parse({
      id: "chatcmpl-public",
      object: "chat.completion",
      created: 1,
      model: publicModel.id,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "پاسخ", refusal: null },
          finish_reason: "stop",
          logprobs: null,
        },
      ],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      system_fingerprint: "public-safe-extension",
    });

    expect(result.choices[0]?.message.content).toBe("پاسخ");
    expect(result.system_fingerprint).toBe("public-safe-extension");
  });

  it("validates streaming chunks, nullable deltas, and optional usage", () => {
    expect(
      chatCompletionChunkSchema.safeParse({
        id: "chatcmpl-public",
        object: "chat.completion.chunk",
        created: 1,
        model: publicModel.id,
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "سلام" },
            finish_reason: null,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      chatCompletionChunkSchema.safeParse({
        id: "chatcmpl-public",
        object: "chat.completion.chunk",
        created: 1,
        model: publicModel.id,
        choices: [],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      }).success,
    ).toBe(true);
  });

  it("enforces non-negative internally consistent usage", () => {
    expect(
      usageSchema.safeParse({
        prompt_tokens: 2,
        completion_tokens: 3,
        total_tokens: 5,
      }).success,
    ).toBe(true);
    expect(
      usageSchema.safeParse({
        prompt_tokens: 2,
        completion_tokens: 3,
        total_tokens: 4,
      }).success,
    ).toBe(false);
    expect(
      usageSchema.safeParse({
        prompt_tokens: -1,
        completion_tokens: 3,
        total_tokens: 2,
      }).success,
    ).toBe(false);
  });

  it("accepts only a bounded closed OpenAI error envelope", () => {
    expect(
      openAIErrorResponseSchema.safeParse({
        error: {
          message: "Request is not ready",
          type: "gateway_error",
          param: null,
          code: "gateway_not_ready",
        },
      }).success,
    ).toBe(true);
    expect(
      openAIErrorResponseSchema.safeParse({
        error: {
          message: "unsafe",
          type: "gateway_error",
          param: null,
          code: "upstream_error",
          provider_url: "https://protected.example",
        },
      }).success,
    ).toBe(false);
  });
});
