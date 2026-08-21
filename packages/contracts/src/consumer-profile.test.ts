import { describe, expect, it } from "vitest";
import {
  chatCompletionChunkSchema,
  chatCompletionSchema,
  livenessSchema,
  modelListSchema,
  notReadySchema,
  openAIErrorResponseSchema,
  readinessSchema,
} from "./openai.js";

describe("Liara consumer profile", () => {
  it("parses the documented model-list fixture without provider identity", () => {
    const parsed = modelListSchema.parse({
      object: "list",
      data: [
        {
          id: "docs-assistant",
          object: "model",
          created: 0,
          owned_by: "ai-gateway",
        },
      ],
    });

    expect(parsed.data).toHaveLength(1);
    expect(JSON.stringify(parsed)).not.toContain("provider");
  });

  it("covers the JSON and SSE data-event response discriminators", () => {
    expect(
      chatCompletionSchema.safeParse({
        id: "chatcmpl-1",
        object: "chat.completion",
        created: 0,
        model: "docs-assistant",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "ok" },
            finish_reason: "stop",
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      chatCompletionChunkSchema.safeParse({
        id: "chatcmpl-1",
        object: "chat.completion.chunk",
        created: 0,
        model: "docs-assistant",
        choices: [{ index: 0, delta: { content: "o" }, finish_reason: null }],
      }).success,
    ).toBe(true);
  });

  it("covers the sanitized default error and health response bodies", () => {
    expect(
      openAIErrorResponseSchema.safeParse({
        error: {
          message: "Invalid request",
          type: "invalid_request_error",
          param: "model",
          code: "invalid_model",
        },
      }).success,
    ).toBe(true);
    expect(livenessSchema.parse({ status: "alive" })).toEqual({
      status: "alive",
    });
    expect(readinessSchema.parse({ status: "ready" })).toEqual({
      status: "ready",
    });
    expect(notReadySchema.parse({ status: "not_ready" })).toEqual({
      status: "not_ready",
    });
  });

  it("rejects retired conversation resources and custom stream events", () => {
    expect(
      modelListSchema.safeParse({
        conversationId: crypto.randomUUID(),
        data: [],
      }).success,
    ).toBe(false);
    expect(
      chatCompletionChunkSchema.safeParse({
        type: "message.delta",
        requestId: crypto.randomUUID(),
        conversationId: crypto.randomUUID(),
        delta: "legacy",
      }).success,
    ).toBe(false);
  });
});
