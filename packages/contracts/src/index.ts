import { z } from "zod";

export const productSchema = z.enum(["liara", "zarinpal"]);
export type Product = z.infer<typeof productSchema>;

export const roleSchema = z.enum(["user", "assistant"]);

export const createConversationResponseSchema = z.object({
  conversationId: z.string().uuid(),
  accessToken: z.string().min(32),
  product: productSchema,
  createdAt: z.string().datetime(),
});
export type CreateConversationResponse = z.infer<
  typeof createConversationResponseSchema
>;

export const sendMessageRequestSchema = z.object({
  content: z.string().trim().min(1).max(8_000),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  role: roleSchema,
  content: z.string(),
  status: z.enum(["streaming", "completed", "failed"]),
  createdAt: z.string().datetime(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const conversationSchema = z.object({
  id: z.string().uuid(),
  product: productSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  messages: z.array(chatMessageSchema),
});
export type Conversation = z.infer<typeof conversationSchema>;

const eventBaseSchema = z.object({
  requestId: z.string().uuid(),
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
});

export const chatStreamEventSchema = z.discriminatedUnion("type", [
  eventBaseSchema.extend({ type: z.literal("message.started") }),
  eventBaseSchema.extend({
    type: z.literal("message.delta"),
    delta: z.string(),
  }),
  eventBaseSchema.extend({
    type: z.literal("message.completed"),
    content: z.string(),
    citations: z
      .array(z.object({ title: z.string(), url: z.string().url() }))
      .default([]),
    usage: z.object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      estimatedCost: z.number().nonnegative(),
    }),
  }),
  eventBaseSchema.extend({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
]);
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
