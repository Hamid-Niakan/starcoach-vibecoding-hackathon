import { describe, expect, it } from "vitest";

import {
  browserChatStateV2Schema,
  corpusManifestSchema,
  evaluationCaseSchema,
  evaluationReportSchema,
  liaraAssistantMetadataV1Schema,
  liaraTerminalChunkSchema,
  migrateBrowserChatStateV1,
  type LiaraAssistantMetadataV1,
} from "./liara-assistant.js";

const revision = "a".repeat(64);
const uuid = "00000000-0000-4000-8000-000000000001";

const metadata: LiaraAssistantMetadataV1 = {
  schema_version: 1,
  documentation_revision: revision,
  intent: { kind: "direct", missing_fields: [], topic_changed: false },
  answer_path: "generated",
  citations: [
    {
      id: "c1",
      marker: 1,
      passage_id: "passage-00000001",
      title: "استقرار Docker",
      url: "https://docs.liara.ir/paas/docker/",
      heading: "استقرار",
      documentation_revision: revision,
      validation: "valid",
    },
  ],
  next_steps: [{ id: "next", label: "ادامه", prompt: "مرحله بعد چیست؟" }],
  workflow: null,
  reuse: "none",
};

describe("Liara assistant public contracts", () => {
  it("accepts only approved structured metadata", () => {
    expect(
      liaraAssistantMetadataV1Schema.parse(metadata).citations,
    ).toHaveLength(1);
    expect(() =>
      liaraAssistantMetadataV1Schema.parse({
        ...metadata,
        citations: [
          { ...metadata.citations[0]!, url: "https://evil.example/source" },
        ],
      }),
    ).toThrow();
  });

  it("accepts a metadata-only terminal SSE chunk", () => {
    expect(
      liaraTerminalChunkSchema.parse({
        id: "chatcmpl-1",
        object: "chat.completion.chunk",
        created: 0,
        model: "liara-docs",
        choices: [],
        x_liara: metadata,
      }).x_liara,
    ).toEqual(metadata);
  });

  it("validates corpus manifests", () => {
    expect(
      corpusManifestSchema.parse({
        revision,
        upstream_revision: "dbb7430b",
        schema_version: 1,
        chunker_version: "heading-v1",
        embedder_revision_digest: revision,
        aggregate_checksum: revision,
        page_count: 1143,
        chunk_count: 2000,
        built_at: "2026-08-21T00:00:00.000Z",
        status: "active",
      }).page_count,
    ).toBe(1143);
  });
});

describe("Liara evaluation contracts", () => {
  it("rejects cases without critical-failure definitions", () => {
    const value = {
      id: "liara-direct-docker",
      schema_version: 1,
      dataset_version: "1.0.0",
      split: "held_out",
      documentation_revision: revision,
      messages: [{ role: "user", content: "چطور Docker مستقر کنم؟" }],
      language: "fa",
      category: "direct",
      difficulty: "simple",
      expected_intent: "direct",
      expected_sources: [{ url: "https://docs.liara.ir/paas/docker/" }],
      required_facts: ["استقرار"],
      required_cautions: [],
      forbidden_claims: [],
      security_tags: [],
      critical_failures: [],
    };
    expect(evaluationCaseSchema.safeParse(value).success).toBe(false);
  });

  it("validates accepted aggregate reports", () => {
    const ratioFields = {
      simple_accuracy: 0.9,
      complex_accuracy: 0.85,
      citation_coverage: 0.95,
      citation_destination_validity: 1,
      abstention_safety: 0.95,
      clarification_accuracy: 0.9,
      context_accuracy: 0.9,
    };
    expect(
      evaluationReportSchema.parse({
        run_id: uuid,
        schema_version: 1,
        started_at: "2026-08-21T00:00:00.000Z",
        completed_at: "2026-08-21T00:01:00.000Z",
        git_sha: "b".repeat(40),
        documentation_revision: revision,
        pipeline_digest: revision,
        dataset_version: "1.0.0",
        split: "held_out",
        status: "accepted",
        aggregate: {
          case_count: 120,
          ...ratioFields,
          ttft_p95_ms: 1500,
          total_latency_p95_ms: 3000,
          input_tokens: 100,
          output_tokens: 50,
          estimated_cost_micro_units: 10,
          cache_hit_rate: 0,
        },
        case_results: [],
        gate_results: [
          { gate: "grounding", status: "pass", evidence: "artifact.json" },
        ],
        artifact_checksums: { "artifact.json": revision },
        reviewer: null,
      }).status,
    ).toBe("accepted");
  });
});

describe("browser state v2", () => {
  it("migrates v1 and restores streaming as stopped", () => {
    const migrated = migrateBrowserChatStateV1({
      version: 1,
      model: "liara-docs",
      updatedAt: "2026-08-21T00:00:00.000Z",
      messages: [
        {
          id: uuid,
          turnId: uuid,
          role: "user",
          content: "سلام",
          status: "completed",
          createdAt: "2026-08-21T00:00:00.000Z",
        },
        {
          id: "00000000-0000-4000-8000-000000000002",
          turnId: uuid,
          role: "assistant",
          content: "در حال پاسخ",
          status: "streaming",
          createdAt: "2026-08-21T00:00:01.000Z",
        },
      ],
    });
    expect(migrated.version).toBe(2);
    expect(migrated.messages[1]?.status).toBe("stopped");
    expect(
      browserChatStateV2Schema.parse(migrated).preferences.explicit,
    ).toEqual([]);
  });

  it("rejects citation revision mismatches", () => {
    const value = migrateBrowserChatStateV1({
      version: 1,
      model: "liara-docs",
      updatedAt: "2026-08-21T00:00:00.000Z",
      messages: [],
    });
    value.messages = [
      {
        id: uuid,
        turnId: uuid,
        role: "user",
        content: "سلام",
        status: "completed",
        createdAt: "2026-08-21T00:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        turnId: uuid,
        role: "assistant",
        content: "پاسخ [۱]",
        status: "completed",
        createdAt: "2026-08-21T00:00:01.000Z",
        metadata: {
          ...metadata,
          citations: [
            {
              ...metadata.citations[0]!,
              documentation_revision: "c".repeat(64),
            },
          ],
        },
      },
    ];
    expect(browserChatStateV2Schema.safeParse(value).success).toBe(false);
  });
});
