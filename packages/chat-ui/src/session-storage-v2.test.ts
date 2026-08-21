import { describe, expect, it } from "vitest";

import {
  loadChatState,
  saveChatState,
  LIARA_CHAT_STORAGE_KEY,
} from "./session-storage.js";

const now = "2026-08-21T10:00:00.000Z";
const turnId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const assistantId = "33333333-3333-4333-8333-333333333333";

const v1 = {
  version: 1 as const,
  model: "liara-assistant",
  updatedAt: now,
  messages: [
    {
      id: userId,
      turnId,
      role: "user" as const,
      content: "سؤال",
      status: "completed" as const,
      createdAt: now,
    },
    {
      id: assistantId,
      turnId,
      role: "assistant" as const,
      content: "نیمه",
      status: "streaming" as const,
      createdAt: now,
    },
  ],
};

describe("browser state v2 persistence", () => {
  it("migrates v1 deterministically and restores an interrupted stream as stopped", () => {
    sessionStorage.setItem(LIARA_CHAT_STORAGE_KEY, JSON.stringify(v1));
    expect(loadChatState(sessionStorage)).toMatchObject({
      version: 2,
      messages: [
        { role: "user", status: "completed" },
        { role: "assistant", status: "stopped" },
      ],
      preferences: {
        language: "auto",
        experience: "unknown",
        service: null,
        explicit: [],
      },
      activeWorkflow: null,
      feedback: [],
    });
  });

  it("persists stable v2 transitions but never writes an active stream", () => {
    expect(
      saveChatState(sessionStorage, LIARA_CHAT_STORAGE_KEY, {
        version: 2,
        model: "liara-assistant",
        messages: v1.messages,
        preferences: {
          language: "auto",
          experience: "unknown",
          service: null,
          explicit: [],
        },
        activeWorkflow: null,
        feedback: [],
        updatedAt: now,
      }),
    ).toBe(false);
    expect(sessionStorage.getItem(LIARA_CHAT_STORAGE_KEY)).toBeNull();
  });

  it("accepts one enum-only feedback record for its completed assistant", () => {
    const completed = { ...v1.messages[1]!, status: "completed" as const };
    expect(
      saveChatState(sessionStorage, LIARA_CHAT_STORAGE_KEY, {
        version: 2,
        model: "liara-assistant",
        messages: [v1.messages[0]!, completed],
        preferences: {
          language: "auto",
          experience: "unknown",
          service: null,
          explicit: [],
        },
        activeWorkflow: null,
        feedback: [
          {
            assistantMessageId: assistantId,
            value: "unhelpful",
            reason: "missing_detail",
            createdAt: now,
          },
        ],
        updatedAt: now,
      }),
    ).toBe(true);
  });

  it("resets malformed, unpaired, oversized, or orphan-feedback state safely", () => {
    for (const value of [
      { version: 2 },
      {
        ...v1,
        version: 2,
        preferences: {},
        activeWorkflow: null,
        feedback: [],
      },
      { ...v1, messages: [v1.messages[1]] },
      {
        ...v1,
        messages: [
          ...v1.messages,
          ...Array.from({ length: 130 }, () => v1.messages[0]!),
        ],
      },
    ]) {
      sessionStorage.setItem(LIARA_CHAT_STORAGE_KEY, JSON.stringify(value));
      expect(loadChatState(sessionStorage)).toBeNull();
    }
  });
});
