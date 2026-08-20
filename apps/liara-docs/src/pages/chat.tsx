import Head from 'next/head'
import Link from 'next/link'
import { ChatPanel } from '@hackathon/chat-ui'

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

export default function ChatPage() {
  return <>
    <Head><title>دستیار مستندات لیارا</title><meta name="description" content="گفتگو با مستندات فنی لیارا" /></Head>
    <main className="liara-chat-page"><Link href="/" className="liara-chat-back">بازگشت به مستندات</Link><ChatPanel apiUrl={apiUrl} product="liara" title="دستیار مستندات لیارا" description="نسخه آزمایشی با تاریخچه گفتگو" /></main>
  </>
}
