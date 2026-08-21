import type { ActiveWorkflow } from "@hackathon/contracts";

export function WorkflowCard({
  workflow,
  onConfirmStep,
}: {
  workflow: ActiveWorkflow;
  onConfirmStep(stepId: string): void;
}) {
  return (
    <section className="hackathon-chat__workflow" aria-label="پیشرفت راهنما">
      <h2>{workflow.goal}</h2>
      <ol>
        {workflow.steps.map((step) => (
          <li key={step.id} data-status={step.status}>
            <span aria-hidden="true">
              {step.status === "completed"
                ? "✓"
                : step.status === "blocked"
                  ? "!"
                  : "•"}
            </span>
            <div>
              <strong>{step.label}</strong>
              {step.verification ? <small>{step.verification}</small> : null}
            </div>
            {step.status === "current" ? (
              <button type="button" onClick={() => onConfirmStep(step.id)}>
                این مرحله را انجام دادم
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
