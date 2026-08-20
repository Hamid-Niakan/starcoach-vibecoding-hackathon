import { NotFoundException } from "@nestjs/common";
import type { Request, Response } from "express";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import type { PersistenceService } from "../persistence/persistence.service";

const conversationId = "a94818f6-0de9-4714-9f04-c48b65efb349";
const requestId = "740bd418-33a0-41b2-8df0-d751ba10b65e";
const conversation = {
  id: conversationId,
  product: "liara" as const,
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
  messages: [],
};

describe("ChatController", () => {
  it("emits a typed incremental stream and persists both message roles", async () => {
    const added: Array<{ role: string; content: string }> = [];
    const persistence = {
      getConversation: jest.fn().mockResolvedValue(conversation),
      addMessage: jest.fn(
        async (_conversationId: string, role: string, content: string) => {
          added.push({ role, content });
          return "e2c33d87-5a96-4d91-90b2-f958245d0535";
        },
      ),
    } as unknown as PersistenceService;
    const frames: string[] = [];
    const response = {
      status: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      flushHeaders: jest.fn(),
      write: jest.fn((frame: string) => frames.push(frame)),
      end: jest.fn(),
    } as unknown as Response;
    const request = {
      headers: { authorization: "Bearer opaque-token" },
      requestId,
      on: jest.fn(),
    } as unknown as Request;

    await new ChatController(new ChatService(), persistence).send(
      "liara",
      conversationId,
      { content: "چطور یک برنامه بسازم؟" },
      request,
      response,
    );

    expect(frames[0]).toContain("event: message.started");
    expect(frames.some((frame) => frame.includes("event: message.delta"))).toBe(
      true,
    );
    expect(frames.at(-1)).toContain("event: message.completed");
    expect(added.map(({ role }) => role)).toEqual(["user", "assistant"]);
    expect(added[1]?.content).toContain("چطور یک برنامه بسازم؟");
    expect(response.end).toHaveBeenCalledTimes(1);
  });

  it("does not expose a conversation through a different product", async () => {
    const persistence = {
      getConversation: jest.fn().mockResolvedValue(null),
    } as unknown as PersistenceService;
    const request = {
      headers: { authorization: "Bearer opaque-token" },
    } as unknown as Request;

    await expect(
      new ChatController(new ChatService(), persistence).get(
        "zarinpal",
        conversationId,
        request,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(persistence.getConversation).toHaveBeenCalledWith(
      "zarinpal",
      conversationId,
      "opaque-token",
    );
  });
});
