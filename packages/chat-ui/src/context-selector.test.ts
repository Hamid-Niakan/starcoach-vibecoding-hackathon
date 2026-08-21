import { describe, expect, it } from "vitest";
import type {
  BrowserChatMessageV2,
  ConversationPreferences,
} from "@hackathon/contracts";

import { selectConversationContext } from "./context-selector.js";

const at = "2026-08-21T10:00:00.000Z";
const message = (
  turn: number,
  role: "user" | "assistant",
  content: string,
  status: BrowserChatMessageV2["status"] = "completed",
): BrowserChatMessageV2 => ({
  id: `${role === "user" ? "1" : "2"}${String(turn).repeat(7)}-${String(turn).repeat(4)}-4${String(turn).repeat(3)}-8${String(turn).repeat(3)}-${String(turn).repeat(12)}`,
  turnId: `${String(turn).repeat(8)}-${String(turn).repeat(4)}-4${String(turn).repeat(3)}-8${String(turn).repeat(3)}-${String(turn).repeat(12)}`,
  role,
  content,
  status,
  createdAt: at,
  ...(status === "failed" ? { errorCode: "timeout" } : {}),
});
const defaults: ConversationPreferences = {
  language: "auto",
  experience: "unknown",
  service: null,
  explicit: [],
};

describe("bounded conversation context", () => {
  it("always retains the latest user turn and only recent stable pairs within budget", () => {
    const messages = [
      message(1, "user", "docker old"),
      message(1, "assistant", "old answer"),
      message(2, "user", "postgres recent"),
      message(2, "assistant", "recent answer"),
      message(3, "user", "postgres current"),
    ];
    const result = selectConversationContext(messages, defaults, {
      maxTurns: 2,
      maxCharacters: 80,
    });
    expect(result.messages.at(-1)).toEqual({
      role: "user",
      content: "postgres current",
    });
    expect(
      result.messages.some((item) => item.content.includes("old answer")),
    ).toBe(false);
  });

  it("excludes failed and streaming output but permits visible stopped output", () => {
    const messages = [
      message(1, "user", "one"),
      message(1, "assistant", "stopped", "stopped"),
      message(2, "user", "two"),
      message(2, "assistant", "failed", "failed"),
      message(3, "user", "now"),
      message(3, "assistant", "streaming", "streaming"),
    ];
    const content = selectConversationContext(messages, defaults).messages.map(
      (item) => item.content,
    );
    expect(content).toContain("stopped");
    expect(content).not.toContain("failed");
    expect(content).not.toContain("streaming");
  });

  it("serializes only explicit preferences and resets unrelated prior topic without summarizing", () => {
    const preferences: ConversationPreferences = {
      language: "fa",
      experience: "novice",
      service: null,
      explicit: ["language", "experience"],
    };
    const result = selectConversationContext(
      [
        message(1, "user", "docker deploy"),
        message(1, "assistant", "docker answer"),
        message(2, "user", "postgres backup"),
      ],
      preferences,
    );
    expect(result.topicChanged).toBe(true);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({ role: "developer" });
    expect(result.messages[0]?.content).toContain('"experience":"novice"');
    expect(result.messages[0]?.content).not.toContain("service");
  });
});
