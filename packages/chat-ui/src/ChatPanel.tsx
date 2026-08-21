"use client";

import { useEffect, useRef, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import { useLiaraChat } from "./use-liara-chat.js";

export interface ChatPanelProps { gatewayUrl: string; storageKey?: string; title?: string; description?: string; className?: string; }

export function ChatPanel({ gatewayUrl, storageKey, title = "دستیار مستندات لیارا", description = "پرسش فنی خود را درباره سرویس‌های لیارا مطرح کنید.", className }: ChatPanelProps) {
  const chat = useLiaraChat(gatewayUrl, storageKey);
  const inputRef = useRef<HTMLTextAreaElement>(null); const wasStreaming = useRef(false);
  useEffect(() => { if (wasStreaming.current && chat.status !== "streaming") inputRef.current?.focus(); wasStreaming.current = chat.status === "streaming"; }, [chat.status]);
  function submit(event: FormEvent) { event.preventDefault(); void chat.submit(); }
  return <section className={`hackathon-chat ${className ?? ""}`} dir="rtl" aria-label="گفتگو" aria-busy={chat.status === "streaming"}>
    <header className="hackathon-chat__header"><div><h1>{title}</h1><p>{description}</p></div><span className="hackathon-chat__badge">نسخه آزمایشی</span></header>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{chat.announcement}</p>
    <div className="hackathon-chat__messages">
      {chat.state.messages.length === 0 ? <div className="hackathon-chat__empty"><strong>از کجا شروع کنیم؟</strong><p>سؤال خود را بنویسید؛ پاسخ به‌صورت زنده نمایش داده می‌شود.</p></div> : null}
      {chat.state.messages.map((message) => <article key={message.id} className={`hackathon-chat__message hackathon-chat__message--${message.role}`} data-status={message.status}>
        <span>{message.role === "user" ? "شما" : "دستیار"}</span><div dir="auto"><ReactMarkdown>{message.content || "…"}</ReactMarkdown></div>
        {message.role === "assistant" && (message.status === "stopped" || message.status === "failed") ? <><small>{message.status === "stopped" ? "پاسخ متوقف شد" : "دریافت پاسخ ناموفق بود"}</small><button type="button" className="hackathon-chat__retry" onClick={() => void chat.retry(message.turnId)}>تلاش دوباره</button></> : null}
      </article>)}
    </div>
    {chat.error ? <div className="hackathon-chat__error" role="alert">{chat.error}</div> : null}
    <form className="hackathon-chat__composer" onSubmit={submit}><label className="sr-only" htmlFor="liara-chat-input">پیام</label><textarea ref={inputRef} id="liara-chat-input" value={chat.input} onChange={(event) => chat.setInput(event.target.value)} maxLength={8000} rows={2} placeholder="پیام خود را بنویسید…" disabled={chat.status === "discovering"} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
      {chat.status === "streaming" ? <button type="button" onClick={chat.cancel}>توقف</button> : <button type="submit" disabled={!chat.input.trim() || chat.status === "discovering"}>ارسال</button>}
    </form>
  </section>;
}
