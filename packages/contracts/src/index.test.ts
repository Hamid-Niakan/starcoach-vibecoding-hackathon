import { describe, expect, it } from "vitest";
import { chatStreamEventSchema, sendMessageRequestSchema } from "./index.js";

describe("chat contracts", () => {
  it("rejects empty and oversized messages", () => {
    expect(sendMessageRequestSchema.safeParse({ content: "" }).success).toBe(
      false,
    );
    expect(
      sendMessageRequestSchema.safeParse({ content: "a".repeat(8_001) })
        .success,
    ).toBe(false);
  });

  it("accepts completed events with reserved trace fields", () => {
    expect(
      chatStreamEventSchema.safeParse({
        type: "message.completed",
        requestId: crypto.randomUUID(),
        conversationId: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
        content: "done",
        citations: [],
        usage: { inputTokens: 1, outputTokens: 1, estimatedCost: 0 },
      }).success,
    ).toBe(true);
  });
});
