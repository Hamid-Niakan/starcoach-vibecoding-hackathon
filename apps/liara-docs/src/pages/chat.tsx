import Head from "next/head";
import Link from "next/link";
import { ChatPanel } from "@hackathon/chat-ui";

const gatewayUrl =
  process.env.NEXT_PUBLIC_AI_GATEWAY_URL ?? "http://localhost:4000";

export default function ChatPage() {
  return (
    <>
      <Head>
        <title>دستیار مستندات لیارا</title>
        <meta name="description" content="گفتگو با دستیار فنی مستندات لیارا" />
      </Head>
      <main className="liara-chat-page" dir="rtl">
        <Link href="/" className="liara-chat-back">
          بازگشت به مستندات
        </Link>
        <ChatPanel
          gatewayUrl={gatewayUrl}
          title="دستیار مستندات لیارا"
          description="پاسخ‌های مستند، مرحله‌به‌مرحله و همراه با منبع رسمی"
        />
      </main>
    </>
  );
}
