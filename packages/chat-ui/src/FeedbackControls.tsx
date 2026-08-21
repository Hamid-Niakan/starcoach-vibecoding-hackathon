import type { BrowserFeedback } from "@hackathon/contracts";

const reasons: Array<[NonNullable<BrowserFeedback["reason"]>, string]> = [
  ["incorrect", "پاسخ نادرست بود"],
  ["missing_detail", "جزئیات کافی نبود"],
  ["bad_source", "منبع مناسب نبود"],
  ["unclear", "پاسخ واضح نبود"],
  ["other", "دلیل دیگر"],
];

export function FeedbackControls({
  value,
  reason,
  onChange,
}: {
  value: BrowserFeedback["value"] | null;
  reason?: BrowserFeedback["reason"];
  onChange(
    value: BrowserFeedback["value"],
    reason?: BrowserFeedback["reason"],
  ): void;
}) {
  return (
    <div className="hackathon-chat__feedback" aria-label="ارزیابی پاسخ">
      <span>این پاسخ مفید بود؟</span>
      <button
        type="button"
        aria-label="پاسخ مفید بود"
        aria-pressed={value === "helpful"}
        onClick={() => onChange("helpful")}
      >
        👍
      </button>
      <button
        type="button"
        aria-label="پاسخ مفید نبود"
        aria-pressed={value === "unhelpful"}
        onClick={() => onChange("unhelpful")}
      >
        👎
      </button>
      {value === "unhelpful" ? (
        <div className="hackathon-chat__feedback-reasons">
          {reasons.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={reason === id}
              onClick={() => onChange("unhelpful", id)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
