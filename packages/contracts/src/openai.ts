import { z } from "zod";

const boundedIdentifierSchema = z.string().min(1).max(128);

export const publicModelSchema = z
  .object({
    id: boundedIdentifierSchema,
    object: z.literal("model"),
    created: z.literal(0),
    owned_by: z.literal("ai-gateway"),
  })
  .strict();
export type PublicModel = z.infer<typeof publicModelSchema>;

export const modelListSchema = z
  .object({
    object: z.literal("list"),
    data: z.array(publicModelSchema).length(1),
  })
  .strict();
export type ModelList = z.infer<typeof modelListSchema>;

export const openAIChatRoleSchema = z.enum([
  "system",
  "developer",
  "user",
  "assistant",
]);
export type OpenAIChatRole = z.infer<typeof openAIChatRoleSchema>;

export const openAIChatMessageSchema = z
  .object({ role: openAIChatRoleSchema, content: z.string() })
  .strict();
export type OpenAIChatMessage = z.infer<typeof openAIChatMessageSchema>;

export const chatCompletionRequestSchema = z
  .object({
    model: boundedIdentifierSchema,
    messages: z.array(openAIChatMessageSchema).min(1).max(128),
    stream: z.boolean().optional().default(false),
    max_completion_tokens: z.number().int().positive().optional(),
  })
  .strict();
export type ChatCompletionRequest = z.input<typeof chatCompletionRequestSchema>;
export type ParsedChatCompletionRequest = z.output<
  typeof chatCompletionRequestSchema
>;

export const streamingChatCompletionRequestSchema =
  chatCompletionRequestSchema.extend({ stream: z.literal(true) });
export type StreamingChatCompletionRequest = z.input<
  typeof streamingChatCompletionRequestSchema
>;

export const usageSchema = z
  .object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((usage, context) => {
    if (usage.total_tokens !== usage.prompt_tokens + usage.completion_tokens) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total_tokens"],
        message: "total_tokens must equal prompt_tokens plus completion_tokens",
      });
    }
  });
export type Usage = z.infer<typeof usageSchema>;

export const assistantMessageSchema = z
  .object({ role: z.literal("assistant"), content: z.string() })
  .passthrough();
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

export const completionChoiceSchema = z
  .object({
    index: z.number().int().nonnegative(),
    message: assistantMessageSchema,
    finish_reason: z.string().nullable().optional(),
  })
  .passthrough();
export type CompletionChoice = z.infer<typeof completionChoiceSchema>;

export const chatCompletionSchema = z
  .object({
    id: z.string().min(1),
    object: z.literal("chat.completion"),
    created: z.number().int(),
    model: boundedIdentifierSchema,
    choices: z.array(completionChoiceSchema),
    usage: usageSchema.optional(),
  })
  .passthrough();
export type ChatCompletion = z.infer<typeof chatCompletionSchema>;

export const chatCompletionDeltaSchema = z
  .object({
    role: z.literal("assistant").optional(),
    content: z.string().nullable().optional(),
  })
  .passthrough();
export type ChatCompletionDelta = z.infer<typeof chatCompletionDeltaSchema>;

export const chatCompletionChunkChoiceSchema = z
  .object({
    index: z.number().int().nonnegative(),
    delta: chatCompletionDeltaSchema,
    finish_reason: z.string().nullable().optional(),
  })
  .passthrough();
export type ChatCompletionChunkChoice = z.infer<
  typeof chatCompletionChunkChoiceSchema
>;

export const chatCompletionChunkSchema = z
  .object({
    id: z.string().min(1),
    object: z.literal("chat.completion.chunk"),
    created: z.number().int(),
    model: boundedIdentifierSchema,
    choices: z.array(chatCompletionChunkChoiceSchema),
    usage: usageSchema.optional(),
  })
  .passthrough();
export type ChatCompletionChunk = z.infer<typeof chatCompletionChunkSchema>;

export const openAIErrorObjectSchema = z
  .object({
    message: z.string().max(512),
    type: z.string().min(1).max(64),
    param: z.string().max(64).nullable(),
    code: z.string().min(1).max(64),
  })
  .strict();
export type OpenAIErrorObject = z.infer<typeof openAIErrorObjectSchema>;

export const openAIErrorResponseSchema = z
  .object({ error: openAIErrorObjectSchema })
  .strict();
export type OpenAIErrorResponse = z.infer<typeof openAIErrorResponseSchema>;

export const livenessSchema = z.object({ status: z.literal("alive") }).strict();
export const readinessSchema = z
  .object({ status: z.literal("ready") })
  .strict();
export const notReadySchema = z
  .object({ status: z.literal("not_ready") })
  .strict();

// Response-oriented aliases keep call sites explicit without defining a second contract.
export const modelListResponseSchema = modelListSchema;
export const chatCompletionResponseSchema = chatCompletionSchema;
export const chatCompletionChunkResponseSchema = chatCompletionChunkSchema;
export const errorResponseSchema = openAIErrorResponseSchema;
