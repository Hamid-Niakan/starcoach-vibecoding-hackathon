import {
  activeWorkflowSchema,
  type ActiveWorkflow,
} from "@hackathon/contracts";

export type WorkflowAction =
  | { type: "workflow.hydrated"; workflow: ActiveWorkflow }
  | {
      type: "step.completed";
      stepId: string;
      confirmedByUser: boolean;
      updatedAt: string;
    }
  | {
      type: "step.blocked";
      stepId: string;
      verification: string;
      updatedAt: string;
    }
  | { type: "retry" }
  | { type: "topic.changed" }
  | { type: "conversation.cleared" };

export function workflowReducer(
  state: ActiveWorkflow | null,
  action: WorkflowAction,
): ActiveWorkflow | null {
  if (action.type === "topic.changed" || action.type === "conversation.cleared")
    return null;
  if (action.type === "workflow.hydrated")
    return activeWorkflowSchema.parse(action.workflow);
  if (action.type === "retry") return state;
  if (!state) throw new Error("No active workflow.");
  const index = state.steps.findIndex((step) => step.id === action.stepId);
  if (index < 0) throw new Error("Unknown workflow step.");
  if (action.type === "step.completed") {
    if (!action.confirmedByUser)
      throw new Error(
        "Workflow completion requires explicit user confirmation.",
      );
    if (state.steps[index]?.status === "pending")
      throw new Error("Workflow steps cannot skip forward.");
    const steps = state.steps.map((step, stepIndex) =>
      stepIndex === index
        ? { ...step, status: "completed" as const }
        : stepIndex === index + 1
          ? { ...step, status: "current" as const }
          : step,
    );
    return activeWorkflowSchema.parse({
      ...state,
      steps,
      updatedAt: action.updatedAt,
    });
  }
  const steps = state.steps.map((step, stepIndex) =>
    stepIndex === index
      ? {
          ...step,
          status: "blocked" as const,
          verification: action.verification,
        }
      : step,
  );
  return activeWorkflowSchema.parse({
    ...state,
    steps,
    updatedAt: action.updatedAt,
  });
}
