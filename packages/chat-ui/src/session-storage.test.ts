import { beforeEach, describe, expect, it } from "vitest";

import { loadChatState, saveChatState, storageKeyFor } from "./session-storage.js";

const streaming = {
  version: 1 as const, model: "liara-assistant", updatedAt: "2026-08-21T10:00:00.000Z",
  messages: [
    { id: "11111111-1111-4111-8111-111111111111", turnId: "22222222-2222-4222-8222-222222222222", role: "user" as const, content: "سلام", status: "completed" as const, createdAt: "2026-08-21T10:00:00.000Z" },
    { id: "33333333-3333-4333-8333-333333333333", turnId: "22222222-2222-4222-8222-222222222222", role: "assistant" as const, content: "نیمه", status: "streaming" as const, createdAt: "2026-08-21T10:00:01.000Z" },
  ],
};

describe("session chat persistence", () => {
  beforeEach(() => sessionStorage.clear());

  it("restores valid version 1 state and normalizes an interrupted stream", () => {
    sessionStorage.setItem(storageKeyFor("liara"), JSON.stringify(streaming));
    expect(loadChatState(sessionStorage, storageKeyFor("liara"))?.messages[1]?.status).toBe("stopped");
  });

  it.each(["not-json", JSON.stringify({ ...streaming, version: 0 }), JSON.stringify({ conversationId: "legacy", accessToken: "secret" })])(
    "discards invalid or legacy state", (value) => {
      const key = storageKeyFor("liara"); sessionStorage.setItem(key, value);
      expect(loadChatState(sessionStorage, key)).toBeNull();
      expect(sessionStorage.getItem(key)).toBeNull();
    },
  );

  it("persists bounded partial state for same-tab reload", () => {
    const key = storageKeyFor("liara"); saveChatState(sessionStorage, key, streaming);
    expect(JSON.parse(sessionStorage.getItem(key) ?? "null")).toMatchObject({ version: 1, model: "liara-assistant" });
    expect(loadChatState(sessionStorage, key)?.messages[1]?.content).toBe("نیمه");
  });

  it("does not share state between independent storage areas", () => {
    const first = new MapStorage(); const second = new MapStorage(); const key = storageKeyFor("liara");
    saveChatState(first, key, streaming);
    expect(loadChatState(first, key)).not.toBeNull();
    expect(loadChatState(second, key)).toBeNull();
  });
});

class MapStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
