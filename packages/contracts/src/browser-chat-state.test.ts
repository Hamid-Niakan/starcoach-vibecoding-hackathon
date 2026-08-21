import { describe, expect, it } from "vitest";
import {
  BROWSER_CHAT_STATE_VERSION,
  browserChatStateSchema,
  normalizeRestoredBrowserChatState,
} from "./browser-chat-state.js";

const now = "2026-08-21T12:00:00.000Z";

function message(
  role: "user" | "assistant",
  status: "completed" | "streaming" | "stopped" | "failed",
  turnId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: crypto.randomUUID(),
    turnId,
    role,
    content: role === "user" ? "سلام" : "پاسخ",
    status,
    createdAt: now,
    ...overrides,
  };
}

describe("browser chat state", () => {
  it("accepts a versioned sequence of UUID-paired turns", () => {
    const firstTurn = crypto.randomUUID();
    const secondTurn = crypto.randomUUID();
    const state = {
      version: BROWSER_CHAT_STATE_VERSION,
      model: "docs-assistant",
      messages: [
        message("user", "completed", firstTurn),
        message("assistant", "completed", firstTurn),
        message("user", "completed", secondTurn),
        message("assistant", "streaming", secondTurn, { content: "" }),
      ],
      updatedAt: now,
    };

    expect(browserChatStateSchema.safeParse(state).success).toBe(true);
  });

  it("rejects unsupported versions and legacy conversation credentials", () => {
    expect(
      browserChatStateSchema.safeParse({
        version: 0,
        model: null,
        messages: [],
        updatedAt: now,
      }).success,
    ).toBe(false);
    expect(
      browserChatStateSchema.safeParse({
        version: 1,
        model: null,
        messages: [],
        updatedAt: now,
        conversationId: crypto.randomUUID(),
        accessToken: "legacy-secret",
      }).success,
    ).toBe(false);
  });

  it("enforces role/status/content/error invariants", () => {
    const turnId = crypto.randomUUID();
    const base = { version: 1, model: null, updatedAt: now };

    expect(
      browserChatStateSchema.safeParse({
        ...base,
        messages: [message("user", "streaming", turnId)],
      }).success,
    ).toBe(false);
    expect(
      browserChatStateSchema.safeParse({
        ...base,
        messages: [message("user", "completed", turnId, { content: "   " })],
      }).success,
    ).toBe(false);
    expect(
      browserChatStateSchema.safeParse({
        ...base,
        messages: [
          message("user", "completed", turnId, { errorCode: "invalid" }),
        ],
      }).success,
    ).toBe(false);
    expect(
      browserChatStateSchema.safeParse({
        ...base,
        messages: [
          message("user", "completed", turnId),
          message("assistant", "stopped", turnId, { errorCode: "invalid" }),
        ],
      }).success,
    ).toBe(false);
    expect(
      browserChatStateSchema.safeParse({
        ...base,
        messages: [
          message("user", "completed", turnId),
          message("assistant", "failed", turnId, {
            errorCode: "timeout",
            content: "",
          }),
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects broken ordering, turn pairing, duplicate IDs, and duplicate turn assistants", () => {
    const firstTurn = crypto.randomUUID();
    const secondTurn = crypto.randomUUID();
    const user = message("user", "completed", firstTurn);
    const base = { version: 1, model: null, updatedAt: now };

    expect(
      browserChatStateSchema.safeParse({
        ...base,
        messages: [message("assistant", "completed", firstTurn)],
      }).success,
    ).toBe(false);
    expect(
      browserChatStateSchema.safeParse({
        ...base,
        messages: [user, message("assistant", "completed", secondTurn)],
      }).success,
    ).toBe(false);
    expect(
      browserChatStateSchema.safeParse({
        ...base,
        messages: [
          user,
          { ...message("assistant", "completed", firstTurn), id: user.id },
        ],
      }).success,
    ).toBe(false);
    expect(
      browserChatStateSchema.safeParse({
        ...base,
        messages: [
          user,
          message("assistant", "completed", firstTurn),
          message("assistant", "stopped", firstTurn),
        ],
      }).success,
    ).toBe(false);
  });

  it("allows at most one active stream", () => {
    const firstTurn = crypto.randomUUID();
    const secondTurn = crypto.randomUUID();
    expect(
      browserChatStateSchema.safeParse({
        version: 1,
        model: null,
        messages: [
          message("user", "completed", firstTurn),
          message("assistant", "streaming", firstTurn),
          message("user", "completed", secondTurn),
          message("assistant", "streaming", secondTurn),
        ],
        updatedAt: now,
      }).success,
    ).toBe(false);
  });

  it("normalizes a restored streaming assistant to stopped without changing other fields", () => {
    const turnId = crypto.randomUUID();
    const state = {
      version: 1,
      model: "docs-assistant",
      messages: [
        message("user", "completed", turnId),
        message("assistant", "streaming", turnId, { content: "partial" }),
      ],
      updatedAt: now,
    };

    const restored = normalizeRestoredBrowserChatState(state);

    expect(restored.messages[1]).toMatchObject({
      status: "stopped",
      content: "partial",
      turnId,
    });
    expect(state.messages[1]?.status).toBe("streaming");
  });
});
