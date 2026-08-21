import { describe, expect, it } from "vitest";
import type { ActiveWorkflow } from "@hackathon/contracts";

import { workflowReducer } from "./workflow-reducer.js";

const workflow: ActiveWorkflow = {
  id: "deploy",
  goal: "استقرار",
  sourceTurnId: "11111111-1111-4111-8111-111111111111",
  updatedAt: "2026-08-21T10:00:00.000Z",
  steps: [
    { id: "build", label: "ساخت", status: "current" },
    { id: "deploy", label: "استقرار", status: "pending" },
  ],
};

describe("workflow state", () => {
  it("moves forward only after explicit user confirmation", () => {
    expect(() =>
      workflowReducer(workflow, {
        type: "step.completed",
        stepId: "build",
        confirmedByUser: false,
        updatedAt: workflow.updatedAt,
      }),
    ).toThrow();
    const next = workflowReducer(workflow, {
      type: "step.completed",
      stepId: "build",
      confirmedByUser: true,
      updatedAt: "2026-08-21T10:01:00.000Z",
    });
    expect(next?.steps.map((step) => step.status)).toEqual([
      "completed",
      "current",
    ]);
  });

  it("keeps blocked verification, ignores retry regression, and resets on topic change", () => {
    const blocked = workflowReducer(workflow, {
      type: "step.blocked",
      stepId: "build",
      verification: "خروجی لاگ را بررسی کنید",
      updatedAt: workflow.updatedAt,
    });
    expect(blocked?.steps[0]).toMatchObject({
      status: "blocked",
      verification: "خروجی لاگ را بررسی کنید",
    });
    expect(workflowReducer(blocked, { type: "retry" })).toEqual(blocked);
    expect(workflowReducer(blocked, { type: "topic.changed" })).toBeNull();
  });

  it("rejects workflows over the ten-step bound", () => {
    expect(() =>
      workflowReducer(null, {
        type: "workflow.hydrated",
        workflow: {
          ...workflow,
          steps: Array.from({ length: 11 }, (_, index) => ({
            id: `s${index}`,
            label: `step ${index}`,
            status: index === 0 ? ("current" as const) : ("pending" as const),
          })),
        },
      }),
    ).toThrow();
  });
});
