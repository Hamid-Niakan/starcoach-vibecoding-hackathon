import { z } from "zod";

export const BROWSER_CHAT_STATE_VERSION = 1 as const;
export const MAX_BROWSER_MESSAGES = 128;
export const MAX_BROWSER_MESSAGE_CONTENT = 65_536;

export const browserMessageRoleSchema = z.enum(["user", "assistant"]);
export const browserMessageStatusSchema = z.enum([
  "completed",
  "streaming",
  "stopped",
  "failed",
]);

export const browserChatMessageSchema = z
  .object({
    id: z.string().uuid(),
    turnId: z.string().uuid(),
    role: browserMessageRoleSchema,
    content: z.string().max(MAX_BROWSER_MESSAGE_CONTENT),
    status: browserMessageStatusSchema,
    createdAt: z.string().datetime({ offset: true }),
    requestId: z.string().uuid().optional(),
    errorCode: z.string().min(1).max(64).optional(),
  })
  .strict()
  .superRefine((message, context) => {
    if (message.role === "user") {
      if (message.status !== "completed") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["status"],
          message: "user messages must be completed",
        });
      }
      if (message.content.trim().length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["content"],
          message: "user messages must contain non-whitespace text",
        });
      }
      if (message.requestId !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["requestId"],
          message: "request IDs belong only to assistant results",
        });
      }
    }

    if (
      message.role === "assistant" &&
      message.status === "completed" &&
      message.content.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "completed assistant messages must contain text",
      });
    }

    if (message.errorCode !== undefined && message.status !== "failed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["errorCode"],
        message: "errorCode is valid only for failed assistant messages",
      });
    }
  });
export type BrowserChatMessage = z.infer<typeof browserChatMessageSchema>;

export const browserChatStateSchema = z
  .object({
    version: z.literal(BROWSER_CHAT_STATE_VERSION),
    model: z.string().min(1).max(128).nullable(),
    messages: z.array(browserChatMessageSchema).max(MAX_BROWSER_MESSAGES),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((state, context) => {
    const messageIds = new Set<string>();
    const userTurnIds = new Set<string>();
    const assistantTurnIds = new Set<string>();
    let streamingCount = 0;

    state.messages.forEach((message, index) => {
      if (messageIds.has(message.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["messages", index, "id"],
          message: "message IDs must be unique",
        });
      }
      messageIds.add(message.id);
      if (message.status === "streaming") streamingCount += 1;

      if (message.role === "user") {
        if (userTurnIds.has(message.turnId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["messages", index, "turnId"],
            message: "each turn must have exactly one user message",
          });
        }
        userTurnIds.add(message.turnId);
        return;
      }

      const previousMessage = state.messages[index - 1];
      if (
        previousMessage?.role !== "user" ||
        previousMessage.turnId !== message.turnId
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["messages", index, "turnId"],
          message:
            "assistant messages must immediately follow their paired user message",
        });
      }
      if (assistantTurnIds.has(message.turnId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["messages", index, "turnId"],
          message: "each turn may have at most one assistant message",
        });
      }
      assistantTurnIds.add(message.turnId);
    });

    if (streamingCount > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["messages"],
        message: "only one assistant message may be streaming",
      });
    }
  });
export type BrowserChatState = z.infer<typeof browserChatStateSchema>;

export function normalizeRestoredBrowserChatState(
  input: unknown,
): BrowserChatState {
  const parsed = browserChatStateSchema.parse(input);
  return {
    ...parsed,
    messages: parsed.messages.map((message) =>
      message.role === "assistant" && message.status === "streaming"
        ? { ...message, status: "stopped" as const }
        : message,
    ),
  };
}

export const restoredBrowserChatStateSchema = browserChatStateSchema.transform(
  (state) => normalizeRestoredBrowserChatState(state),
);
