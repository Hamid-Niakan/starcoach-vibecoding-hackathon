const prompts = [
  {
    label: "استقرار Docker",
    prompt: "چطور یک برنامه Docker را در لیارا مستقر کنم؟",
  },
  {
    label: "رفع خطای دامنه",
    prompt: "برای رفع خطای اتصال دامنه چه چیزهایی را بررسی کنم؟",
  },
  {
    label: "انتخاب پایگاه داده",
    prompt: "برای پروژه‌ام کدام سرویس پایگاه داده لیارا مناسب است؟",
  },
];

export function ChatEmptyState({
  onChoosePrompt,
}: {
  onChoosePrompt(prompt: string): void;
}) {
  return (
    <div className="hackathon-chat__empty">
      <strong>از کجا شروع کنیم؟</strong>
      <p>
        دستیار فقط بر پایه مستندات رسمی پاسخ می‌دهد و منبع را کنار پاسخ نشان
        می‌دهد.
      </p>
      <div className="hackathon-chat__examples" aria-label="پرسش‌های نمونه">
        {prompts.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onChoosePrompt(item.prompt)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <small>پرسش نمونه فقط در کادر نوشته می‌شود و خودکار ارسال نمی‌شود.</small>
    </div>
  );
}
