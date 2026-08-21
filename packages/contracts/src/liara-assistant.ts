import { z } from "zod";

import {
  browserChatStateSchema,
  type BrowserChatState,
} from "./browser-chat-state.js";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const gitRevisionSchema = z.string().regex(/^[a-f0-9]{7,40}$/);
const boundedIdSchema = z.string().min(1).max(128);
const timestampSchema = z.string().datetime({ offset: true });

export const liaraIntentKindSchema = z.enum([
  "direct",
  "complex",
  "clarify",
  "abstain",
  "out_of_scope",
  "elevated_risk",
]);
export type LiaraIntentKind = z.infer<typeof liaraIntentKindSchema>;

export const liaraIntentMetadataSchema = z
  .object({
    kind: liaraIntentKindSchema,
    missing_fields: z
      .array(
        z.enum([
          "service",
          "runtime",
          "version",
          "environment",
          "goal",
          "error_context",
        ]),
      )
      .max(5)
      .refine((values) => new Set(values).size === values.length, {
        message: "missing_fields must be unique",
      }),
    topic_changed: z.boolean(),
  })
  .strict();

export const liaraCitationSchema = z
  .object({
    id: z.string().regex(/^c[1-9][0-9]?$/),
    marker: z.number().int().min(1).max(12),
    passage_id: z.string().min(16).max(128),
    title: z.string().min(1).max(240),
    url: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          url.hostname === "docs.liara.ir" &&
          url.username === "" &&
          url.password === ""
        );
      }, "citation URL must use the approved Liara documentation origin"),
    heading: z.string().max(240).nullable().optional(),
    documentation_revision: sha256Schema,
    validation: z.literal("valid"),
  })
  .strict();
export type LiaraCitation = z.infer<typeof liaraCitationSchema>;

export const liaraNextStepSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(160),
    prompt: z.string().min(1).max(500).optional(),
    url: z
      .string()
      .url()
      .refine((value) => new URL(value).origin === "https://docs.liara.ir", {
        message:
          "next-step URL must use the approved Liara documentation origin",
      })
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.prompt === undefined) === (value.url === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "next step must contain exactly one of prompt or url",
      });
    }
  });

export const liaraWorkflowStepSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(240),
    status: z.enum(["pending", "current", "completed", "blocked"]),
    verification: z.string().max(500).nullable().optional(),
  })
  .strict();

export const liaraWorkflowMetadataSchema = z
  .object({
    id: z.string().min(1).max(64),
    goal: z.string().min(1).max(240),
    steps: z.array(liaraWorkflowStepSchema).min(1).max(10),
  })
  .strict()
  .superRefine((workflow, context) => {
    const ids = workflow.steps.map((step) => step.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps"],
        message: "workflow step IDs must be unique",
      });
    }
    if (workflow.steps.filter((step) => step.status === "current").length > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps"],
        message: "workflow may have at most one current step",
      });
    }
  });

export const liaraAssistantMetadataV1Schema = z
  .object({
    schema_version: z.literal(1),
    documentation_revision: sha256Schema,
    intent: liaraIntentMetadataSchema,
    answer_path: z.enum([
      "generated",
      "clarification",
      "abstention",
      "exact_cache",
    ]),
    citations: z.array(liaraCitationSchema).max(12),
    next_steps: z.array(liaraNextStepSchema).max(3),
    workflow: liaraWorkflowMetadataSchema.nullable().optional(),
    reuse: z.enum(["none", "retrieval", "reviewed_exact_answer"]),
  })
  .strict()
  .superRefine((metadata, context) => {
    const ids = metadata.citations.map((citation) => citation.id);
    const markers = metadata.citations.map((citation) => citation.marker);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["citations"],
        message: "citation IDs must be unique",
      });
    }
    if (new Set(markers).size !== markers.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["citations"],
        message: "citation markers must be unique",
      });
    }
    metadata.citations.forEach((citation, index) => {
      if (citation.documentation_revision !== metadata.documentation_revision) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["citations", index, "documentation_revision"],
          message: "citation revision must equal response revision",
        });
      }
    });
  });
export type LiaraAssistantMetadataV1 = z.infer<
  typeof liaraAssistantMetadataV1Schema
>;

export const liaraTerminalChunkSchema = z
  .object({
    id: z.string().min(1),
    object: z.literal("chat.completion.chunk"),
    created: z.number().int(),
    model: boundedIdSchema,
    choices: z.array(z.never()).length(0),
    x_liara: liaraAssistantMetadataV1Schema,
  })
  .passthrough();
export type LiaraTerminalChunk = z.infer<typeof liaraTerminalChunkSchema>;

export const corpusManifestStatusSchema = z.enum([
  "building",
  "validating",
  "active",
  "superseded",
  "failed",
]);

export const corpusManifestSchema = z
  .object({
    revision: sha256Schema,
    upstream_revision: gitRevisionSchema,
    schema_version: z.literal(1),
    chunker_version: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
    embedder_revision_digest: sha256Schema,
    aggregate_checksum: sha256Schema,
    page_count: z.number().int().positive(),
    chunk_count: z.number().int().positive(),
    built_at: timestampSchema,
    status: corpusManifestStatusSchema,
    index_uid: z
      .string()
      .regex(/^liara_docs_[a-f0-9]{12,64}$/)
      .optional(),
    route_inventory_checksum: sha256Schema.optional(),
    policy_digest: sha256Schema.optional(),
  })
  .strict();
export type CorpusManifest = z.infer<typeof corpusManifestSchema>;

const evaluationMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(8_000),
  })
  .strict();

export const evaluationCaseSchema = z
  .object({
    id: z.string().regex(/^liara-[a-z0-9-]{3,80}$/),
    schema_version: z.literal(1),
    dataset_version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
    split: z.enum(["tuning", "held_out"]),
    documentation_revision: sha256Schema,
    messages: z.array(evaluationMessageSchema).min(1).max(13),
    language: z.enum(["fa", "en", "mixed", "finglish"]),
    category: z.enum([
      "direct",
      "complex",
      "troubleshooting",
      "comparison",
      "ambiguous",
      "unanswerable",
      "out_of_scope",
      "prompt_injection",
      "destructive_live_state",
    ]),
    difficulty: z.enum(["simple", "complex"]),
    expected_intent: liaraIntentKindSchema,
    expected_sources: z
      .array(
        z
          .object({
            url: z
              .string()
              .url()
              .refine(
                (value) => new URL(value).origin === "https://docs.liara.ir",
              ),
            anchor: z.string().max(240).nullable().optional(),
          })
          .strict(),
      )
      .max(12),
    required_facts: z.array(z.string().min(1).max(1_000)).max(20),
    required_cautions: z.array(z.string().min(1).max(1_000)).max(10),
    forbidden_claims: z.array(z.string().min(1).max(1_000)).max(20),
    expected_clarification: z.string().max(1_000).nullable().optional(),
    security_tags: z
      .array(z.string().regex(/^[a-z0-9_-]{1,64}$/))
      .max(12)
      .refine((values) => new Set(values).size === values.length),
    critical_failures: z.array(z.string().min(1).max(500)).min(1).max(20),
  })
  .strict();
export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

const ratioSchema = z.number().min(0).max(1);
export const evaluationAggregateSchema = z
  .object({
    case_count: z.number().int().nonnegative(),
    simple_accuracy: ratioSchema,
    complex_accuracy: ratioSchema,
    citation_coverage: ratioSchema,
    citation_destination_validity: ratioSchema,
    abstention_safety: ratioSchema,
    clarification_accuracy: ratioSchema,
    context_accuracy: ratioSchema,
    ttft_p95_ms: z.number().int().nonnegative(),
    total_latency_p95_ms: z.number().int().nonnegative(),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    estimated_cost_micro_units: z.number().int().nonnegative(),
    cache_hit_rate: ratioSchema,
    quality_regression_percentage_points: z.number().optional(),
    cost_reduction_ratio: ratioSchema.optional(),
  })
  .strict();

export const evaluationReportSchema = z
  .object({
    run_id: z.string().uuid(),
    schema_version: z.literal(1),
    started_at: timestampSchema,
    completed_at: timestampSchema.nullable(),
    git_sha: z.string().regex(/^[a-f0-9]{40}$/),
    documentation_revision: sha256Schema,
    pipeline_digest: sha256Schema,
    dataset_version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
    split: z.enum([
      "baseline",
      "tuning",
      "held_out",
      "repeated_workload",
      "staging",
    ]),
    status: z.enum([
      "running",
      "awaiting_human_review",
      "accepted",
      "rejected",
    ]),
    aggregate: evaluationAggregateSchema,
    case_results: z.array(z.record(z.unknown())),
    gate_results: z
      .array(
        z
          .object({
            gate: z.string().min(1).max(128),
            status: z.enum(["pass", "fail", "blocked"]),
            evidence: z.string().min(1).max(500),
          })
          .strict(),
      )
      .min(1),
    artifact_checksums: z.record(sha256Schema),
    reviewer: z.string().max(128).nullable().optional(),
  })
  .strict()
  .superRefine((report, context) => {
    if (report.status === "accepted" && report.completed_at === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completed_at"],
        message: "accepted reports must be completed",
      });
    }
    if (
      report.status === "accepted" &&
      report.gate_results.some((gate) => gate.status !== "pass")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gate_results"],
        message: "accepted reports require every gate to pass",
      });
    }
  });
export type EvaluationReport = z.infer<typeof evaluationReportSchema>;

export const conversationPreferencesSchema = z
  .object({
    language: z.enum(["auto", "fa", "en"]),
    experience: z.enum(["unknown", "novice", "experienced"]),
    service: z.string().max(64).nullable(),
    explicit: z
      .array(z.enum(["language", "experience", "service"]))
      .max(3)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict()
  .superRefine((preferences, context) => {
    const required: Array<"language" | "experience" | "service"> = [];
    if (preferences.language !== "auto") required.push("language");
    if (preferences.experience !== "unknown") required.push("experience");
    if (preferences.service !== null) required.push("service");
    for (const key of required) {
      if (!preferences.explicit.includes(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["explicit"],
          message: `non-default ${key} must be explicit`,
        });
      }
    }
  });
export type ConversationPreferences = z.infer<
  typeof conversationPreferencesSchema
>;

export const browserFeedbackSchema = z
  .object({
    assistantMessageId: z.string().uuid(),
    value: z.enum(["helpful", "unhelpful"]),
    reason: z
      .enum(["incorrect", "missing_detail", "bad_source", "unclear", "other"])
      .optional(),
    createdAt: timestampSchema,
  })
  .strict();
export type BrowserFeedback = z.infer<typeof browserFeedbackSchema>;

export const activeWorkflowSchema = z
  .object({
    id: z.string().min(1).max(64),
    goal: z.string().min(1).max(240),
    steps: z.array(liaraWorkflowStepSchema).min(1).max(10),
    sourceTurnId: z.string().uuid(),
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((workflow, context) => {
    if (
      new Set(workflow.steps.map((step) => step.id)).size !==
      workflow.steps.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps"],
        message: "workflow step IDs must be unique",
      });
    }
    if (workflow.steps.filter((step) => step.status === "current").length > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["steps"],
        message: "workflow may have at most one current step",
      });
    }
  });
export type ActiveWorkflow = z.infer<typeof activeWorkflowSchema>;

const imageDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const deploymentEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    gitSha: z.string().regex(/^[a-f0-9]{40}$/),
    documentationRevision: sha256Schema,
    imageDigests: z
      .object({ gateway: imageDigestSchema, docs: imageDigestSchema })
      .strict(),
    configurationNames: z
      .array(z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/))
      .min(1)
      .max(128)
      .refine((items) => new Set(items).size === items.length),
    acceptanceChecksum: sha256Schema,
    operator: z.string().min(1).max(128),
    stagedAt: timestampSchema,
    publicUrls: z
      .object({ gateway: z.string().url(), docs: z.string().url() })
      .strict(),
    rollback: z
      .object({
        startedAt: timestampSchema,
        completedAt: timestampSchema,
        durationSeconds: z.number().int().nonnegative().max(1800),
        result: z.literal("passed"),
        fromGatewayDigest: imageDigestSchema,
        toGatewayDigest: imageDigestSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Date(value.rollback.completedAt) < new Date(value.rollback.startedAt)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rollback", "completedAt"],
        message: "rollback completion precedes start",
      });
    if (value.publicUrls.gateway === value.publicUrls.docs)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publicUrls"],
        message: "apps require independent public URLs",
      });
  });
export type DeploymentEvidence = z.infer<typeof deploymentEvidenceSchema>;

export const browserChatMessageV2Schema = z
  .object({
    id: z.string().uuid(),
    turnId: z.string().uuid(),
    role: z.enum(["user", "assistant"]),
    content: z.string().max(65_536),
    status: z.enum(["completed", "streaming", "stopped", "failed"]),
    createdAt: timestampSchema,
    requestId: z.string().uuid().optional(),
    errorCode: z.string().min(1).max(64).optional(),
    metadata: liaraAssistantMetadataV1Schema.optional(),
  })
  .strict()
  .superRefine((message, context) => {
    if (message.role === "user") {
      if (message.status !== "completed" || message.content.trim() === "") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "user messages must be non-empty and completed",
        });
      }
      if (
        message.metadata !== undefined ||
        message.requestId !== undefined ||
        message.errorCode !== undefined
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "user messages cannot contain assistant result fields",
        });
      }
    }
    if (message.status === "failed" && message.errorCode === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["errorCode"],
        message: "failed messages require an error code",
      });
    }
    if (message.errorCode !== undefined && message.status !== "failed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["errorCode"],
        message: "error codes belong only to failed messages",
      });
    }
    if (message.metadata !== undefined && message.status !== "completed") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["metadata"],
        message: "metadata belongs only to completed assistant messages",
      });
    }
  });
export type BrowserChatMessageV2 = z.infer<typeof browserChatMessageV2Schema>;

export const browserChatStateV2Schema = z
  .object({
    version: z.literal(2),
    model: boundedIdSchema.nullable(),
    messages: z.array(browserChatMessageV2Schema).max(128),
    preferences: conversationPreferencesSchema,
    activeWorkflow: activeWorkflowSchema.nullable(),
    feedback: z.array(browserFeedbackSchema).max(64),
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((state, context) => {
    const messageIds = new Set<string>();
    const completedAssistantIds = new Set<string>();
    const userTurnIds = new Set<string>();
    const assistantTurnIds = new Set<string>();
    const feedbackIds = new Set<string>();
    let streaming = 0;
    state.messages.forEach((message, index) => {
      if (messageIds.has(message.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["messages", index, "id"],
          message: "message IDs must be unique",
        });
      }
      messageIds.add(message.id);
      if (message.status === "streaming") streaming += 1;
      if (message.role === "assistant") {
        if (message.status === "completed")
          completedAssistantIds.add(message.id);
        if (assistantTurnIds.has(message.turnId))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["messages", index, "turnId"],
            message: "each turn may have one assistant",
          });
        assistantTurnIds.add(message.turnId);
        const prior = state.messages[index - 1];
        if (prior?.role !== "user" || prior.turnId !== message.turnId) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["messages", index, "turnId"],
            message: "assistant must immediately follow its paired user",
          });
        }
      } else {
        if (userTurnIds.has(message.turnId))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["messages", index, "turnId"],
            message: "each turn must have one user",
          });
        userTurnIds.add(message.turnId);
        const next = state.messages[index + 1];
        if (next?.role !== "assistant" || next.turnId !== message.turnId)
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["messages", index, "turnId"],
            message: "each user turn must be followed by its assistant result",
          });
      }
      if (message.metadata !== undefined) {
        message.metadata.citations.forEach((citation) => {
          if (
            citation.documentation_revision !==
            message.metadata?.documentation_revision
          ) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["messages", index, "metadata", "citations"],
              message: "citation revision must match message metadata",
            });
          }
        });
      }
    });
    if (streaming > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["messages"],
        message: "only one assistant may be streaming",
      });
    }
    state.feedback.forEach((feedback, index) => {
      if (!completedAssistantIds.has(feedback.assistantMessageId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["feedback", index, "assistantMessageId"],
          message: "feedback must reference an assistant message",
        });
      }
      if (feedbackIds.has(feedback.assistantMessageId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["feedback", index],
          message: "only one feedback record is allowed per answer",
        });
      }
      feedbackIds.add(feedback.assistantMessageId);
    });
    if (
      state.activeWorkflow !== null &&
      !state.messages.some(
        (message) => message.turnId === state.activeWorkflow?.sourceTurnId,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["activeWorkflow", "sourceTurnId"],
        message: "workflow must reference a visible turn",
      });
    }
  });
export type BrowserChatStateV2 = z.infer<typeof browserChatStateV2Schema>;

export function migrateBrowserChatStateV1(input: unknown): BrowserChatStateV2 {
  const state: BrowserChatState = browserChatStateSchema.parse(input);
  return browserChatStateV2Schema.parse({
    version: 2,
    model: state.model,
    messages: state.messages.map((message) => ({
      ...message,
      status:
        message.role === "assistant" && message.status === "streaming"
          ? "stopped"
          : message.status,
    })),
    preferences: {
      language: "auto",
      experience: "unknown",
      service: null,
      explicit: [],
    },
    activeWorkflow: null,
    feedback: [],
    updatedAt: state.updatedAt,
  });
}

export function normalizeRestoredBrowserChatStateV2(
  input: unknown,
): BrowserChatStateV2 {
  const state = browserChatStateV2Schema.parse(input);
  return browserChatStateV2Schema.parse({
    ...state,
    messages: state.messages.map((message) =>
      message.role === "assistant" && message.status === "streaming"
        ? { ...message, status: "stopped" }
        : message,
    ),
  });
}
