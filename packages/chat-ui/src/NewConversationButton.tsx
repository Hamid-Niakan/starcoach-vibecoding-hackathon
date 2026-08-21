"use client";

import { useState } from "react";

export function NewConversationButton({
  hasHistory,
  onConfirm,
}: {
  hasHistory: boolean;
  onConfirm(): void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!hasHistory)
    return (
      <button type="button" className="hackathon-chat__new" onClick={onConfirm}>
        گفتگوی تازه
      </button>
    );
  return (
    <div className="hackathon-chat__new-wrap">
      <button
        type="button"
        className="hackathon-chat__new"
        onClick={() => setConfirming(true)}
      >
        گفتگوی تازه
      </button>
      {confirming ? (
        <div
          className="hackathon-chat__confirm"
          role="dialog"
          aria-modal="true"
          aria-label="تأیید گفتگوی تازه"
        >
          <p>تاریخچه این برگه پاک می‌شود.</p>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              setConfirming(false);
            }}
          >
            پاک کردن و شروع
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            انصراف
          </button>
        </div>
      ) : null}
    </div>
  );
}
