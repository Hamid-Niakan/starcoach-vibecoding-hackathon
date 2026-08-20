import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import {
  productSchema,
  sendMessageRequestSchema,
  type ChatStreamEvent,
  type Product,
} from "@hackathon/contracts";
import type { Request, Response } from "express";
import { ChatService } from "./chat.service";
import { PersistenceService } from "../persistence/persistence.service";

@Controller("api/v1/:product")
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly persistence: PersistenceService,
  ) {}

  @Post("conversations")
  @HttpCode(201)
  create(@Param("product") rawProduct: string) {
    return this.persistence.createConversation(this.product(rawProduct));
  }

  @Get("conversations/:id")
  async get(
    @Param("product") rawProduct: string,
    @Param("id") id: string,
    @Req() request: Request,
  ) {
    const conversation = await this.authorized(
      this.product(rawProduct),
      id,
      request,
    );
    return conversation;
  }

  @Post("conversations/:id/messages")
  async send(
    @Param("product") rawProduct: string,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const product = this.product(rawProduct);
    await this.authorized(product, id, request);
    const parsed = sendMessageRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException("Invalid message payload");
    const requestId = request.requestId ?? randomUUID();
    await this.persistence.addMessage(
      id,
      "user",
      parsed.data.content,
      requestId,
    );
    const messageId = randomUUID();
    const answer = this.chat.createMockAnswer(product, parsed.data.content);
    response.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();
    this.write(response, {
      type: "message.started",
      requestId,
      conversationId: id,
      messageId,
    });
    let closed = false;
    request.on("close", () => {
      closed = true;
    });
    for (const delta of this.chat.chunks(answer)) {
      if (closed) return;
      this.write(response, {
        type: "message.delta",
        requestId,
        conversationId: id,
        messageId,
        delta,
      });
      await new Promise((resolve) => setTimeout(resolve, 28));
    }
    if (closed) return;
    await this.persistence.addMessage(id, "assistant", answer, requestId, {
      provider: "mock",
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
    });
    this.write(response, {
      type: "message.completed",
      requestId,
      conversationId: id,
      messageId,
      content: answer,
      citations: [],
      usage: { inputTokens: 0, outputTokens: 0, estimatedCost: 0 },
    });
    response.end();
  }

  private product(value: string): Product {
    const parsed = productSchema.safeParse(value);
    if (!parsed.success) throw new NotFoundException("Unknown product");
    return parsed.data;
  }
  private token(request: Request) {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer "))
      throw new UnauthorizedException("Conversation access token is required");
    return header.slice(7);
  }
  private async authorized(product: Product, id: string, request: Request) {
    const conversation = await this.persistence.getConversation(
      product,
      id,
      this.token(request),
    );
    if (!conversation) throw new NotFoundException("Conversation not found");
    return conversation;
  }
  private write(response: Response, event: ChatStreamEvent) {
    response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }
}
