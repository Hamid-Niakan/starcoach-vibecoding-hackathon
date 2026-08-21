import { describe, expect, it } from "vitest";

import { conversationReducer, createInitialConversationState, projectVisibleContext } from "./conversation-reducer.js";

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];

describe("conversationReducer", () => {
  it("creates ordered user/assistant pairs with one active stream", () => {
    const state = conversationReducer(createInitialConversationState(), {
      type: "turn.started", turnId: ids[0]!, userId: ids[1]!, assistantId: ids[2]!, content: "سلام", createdAt: "2026-08-21T10:00:00.000Z",
    });
    expect(state.messages.map(({ role, turnId, status }) => ({ role, turnId, status }))).toEqual([
      { role: "user", turnId: ids[0], status: "completed" },
      { role: "assistant", turnId: ids[0], status: "streaming" },
    ]);
    expect(() => conversationReducer(state, { type: "turn.started", turnId: ids[3]!, userId: crypto.randomUUID(), assistantId: crypto.randomUUID(), content: "دوباره", createdAt: new Date().toISOString() })).toThrow();
  });

  it("appends deltas and completes, stops, or fails the assistant", () => {
    const start = conversationReducer(createInitialConversationState(), { type: "turn.started", turnId: ids[0]!, userId: ids[1]!, assistantId: ids[2]!, content: "سلام", createdAt: "2026-08-21T10:00:00.000Z" });
    const delta = conversationReducer(start, { type: "assistant.delta", turnId: ids[0]!, content: "پاسخ" });
    expect(conversationReducer(delta, { type: "assistant.stopped", turnId: ids[0]!, requestId: ids[3] }).messages[1]).toMatchObject({ content: "پاسخ", status: "stopped", requestId: ids[3] });
    expect(conversationReducer(delta, { type: "assistant.completed", turnId: ids[0]!, requestId: ids[3] }).messages[1]).toMatchObject({ status: "completed" });
    expect(conversationReducer(delta, { type: "assistant.failed", turnId: ids[0]!, code: "timeout", requestId: ids[3] }).messages[1]).toMatchObject({ status: "failed", errorCode: "timeout" });
  });

  it("includes stopped results and excludes failed/current streams from visible context", () => {
    const state = { ...createInitialConversationState(), messages: [
      { id: ids[1]!, turnId: ids[0]!, role: "user" as const, content: "یک", status: "completed" as const, createdAt: "2026-08-21T10:00:00.000Z" },
      { id: ids[2]!, turnId: ids[0]!, role: "assistant" as const, content: "نیمه", status: "stopped" as const, createdAt: "2026-08-21T10:00:01.000Z" },
      { id: ids[3]!, turnId: "55555555-5555-4555-8555-555555555555", role: "user" as const, content: "دو", status: "completed" as const, createdAt: "2026-08-21T10:00:02.000Z" },
      { id: "66666666-6666-4666-8666-666666666666", turnId: "55555555-5555-4555-8555-555555555555", role: "assistant" as const, content: "خطا", status: "failed" as const, createdAt: "2026-08-21T10:00:03.000Z", errorCode: "timeout" },
    ] };
    expect(projectVisibleContext(state.messages)).toEqual([
      { role: "user", content: "یک" }, { role: "assistant", content: "نیمه" }, { role: "user", content: "دو" },
    ]);
  });

  it("retries by replacing the old assistant without duplicating its user", () => {
    const state = { ...createInitialConversationState(), messages: [
      { id: ids[1]!, turnId: ids[0]!, role: "user" as const, content: "یک", status: "completed" as const, createdAt: "2026-08-21T10:00:00.000Z" },
      { id: ids[2]!, turnId: ids[0]!, role: "assistant" as const, content: "نیمه", status: "stopped" as const, createdAt: "2026-08-21T10:00:01.000Z" },
    ] };
    const retried = conversationReducer(state, { type: "turn.retried", turnId: ids[0]!, assistantId: ids[3]!, createdAt: "2026-08-21T10:01:00.000Z" });
    expect(retried.messages).toHaveLength(2);
    expect(retried.messages[1]).toMatchObject({ id: ids[3], turnId: ids[0], content: "", status: "streaming" });
  });
});
