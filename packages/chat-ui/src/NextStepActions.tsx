import type { LiaraAssistantMetadataV1 } from "@hackathon/contracts";

export function NextStepActions({
  steps,
  onPrompt,
}: {
  steps: LiaraAssistantMetadataV1["next_steps"];
  onPrompt(prompt: string): void;
}) {
  if (!steps.length) return null;
  return (
    <div className="hackathon-chat__next">
      <strong>گام بعدی پیشنهادی</strong>
      {steps.map((step) =>
        step.prompt ? (
          <button
            type="button"
            key={step.id}
            onClick={() => onPrompt(step.prompt!)}
          >
            {step.label}
          </button>
        ) : (
          <a
            key={step.id}
            href={step.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {step.label}
          </a>
        ),
      )}
    </div>
  );
}
