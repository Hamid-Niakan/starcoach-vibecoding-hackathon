import Link from "next/link";

export default function ChatLauncher() {
  return (
    <Link
      className="liara-chat-launcher"
      href="/chat"
      aria-label="باز کردن دستیار مستندات"
      dir="rtl"
      rel="noopener"
    >
      <span aria-hidden="true">✦</span>
      <span>از دستیار مستندات بپرسید</span>
    </Link>
  );
}
