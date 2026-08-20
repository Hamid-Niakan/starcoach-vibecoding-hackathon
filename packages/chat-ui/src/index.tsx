"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import {
  HackathonApiClient,
  type ConversationCredentials,
} from "@hackathon/api-client";
import type { ChatMessage, Product } from "@hackathon/contracts";

export interface ChatPanelProps {
  apiUrl: string;
  product: Product;
  title: string;
  description: string;
  storageKey?: string;
  className?: string;
}

export function ChatPanel({
  apiUrl,
  product,
  title,
  description,
  storageKey,
  className,
}: ChatPanelProps) {
  const key = storageKey ?? `hackathon-chat-${product}`;
  const api = useMemo(() => new HackathonApiClient(apiUrl), [apiUrl]);
  const [credentials, setCredentials] =
    useState<ConversationCredentials | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "streaming" | "error"
  >("idle");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as ConversationCredentials;
      setCredentials(saved);
      setStatus("loading");
      api
        .getConversation(product, saved)
        .then((conversation) => setMessages(conversation.messages))
        .catch(() => window.localStorage.removeItem(key))
        .finally(() => setStatus("idle"));
    } catch {
      window.localStorage.removeItem(key);
    }
  }, [api, key, product]);

  const ensureConversation = useCallback(async () => {
    if (credentials) return credentials;
    const created = await api.createConversation(product);
    const next = {
      conversationId: created.conversationId,
      accessToken: created.accessToken,
    };
    window.localStorage.setItem(key, JSON.stringify(next));
    setCredentials(next);
    return next;
  }, [api, credentials, key, product]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || status === "streaming") return;
    setInput("");
    setError("");
    const user: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      status: "completed",
      createdAt: new Date().toISOString(),
    };
    const assistant: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, user, assistant]);
    setStatus("streaming");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const active = await ensureConversation();
      for await (const part of api.sendMessage(
        product,
        active,
        content,
        controller.signal,
      )) {
        if (part.type === "message.started") assistant.id = part.messageId;
        if (part.type === "message.delta") assistant.content += part.delta;
        if (part.type === "message.completed") {
          assistant.content = part.content;
          assistant.status = "completed";
        }
        if (part.type === "error") throw new Error(part.message);
        setMessages((current) =>
          current.map((item) => (item === assistant ? { ...assistant } : item)),
        );
      }
      setStatus("idle");
    } catch (cause) {
      if (controller.signal.aborted) {
        assistant.status = "failed";
        setError("پاسخ متوقف شد. می‌توانید دوباره تلاش کنید.");
      } else {
        assistant.status = "failed";
        setError(cause instanceof Error ? cause.message : "خطای ناشناخته");
      }
      setMessages((current) =>
        current.map((item) => (item === assistant ? { ...assistant } : item)),
      );
      setStatus("error");
    } finally {
      abortRef.current = null;
    }
  }

  return (
    <section
      className={`hackathon-chat ${className ?? ""}`}
      dir="rtl"
      aria-label={title}
    >
      <header className="hackathon-chat__header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <span className="hackathon-chat__badge">نسخه آزمایشی</span>
      </header>
      <div className="hackathon-chat__messages" aria-live="polite">
        {messages.length === 0 ? (
          <div className="hackathon-chat__empty">
            <strong>از کجا شروع کنیم؟</strong>
            <p>
              سؤال خود را بنویسید. پاسخ آزمایشی به‌صورت زنده نمایش داده می‌شود.
            </p>
          </div>
        ) : null}
        {messages.map((message) => (
          <article
            key={message.id}
            className={`hackathon-chat__message hackathon-chat__message--${message.role}`}
          >
            <span>{message.role === "user" ? "شما" : "دستیار"}</span>
            <div dir="auto">
              <ReactMarkdown>{message.content || "…"}</ReactMarkdown>
            </div>
            {message.status === "failed" ? <small>ارسال کامل نشد</small> : null}
          </article>
        ))}
      </div>
      {error ? (
        <div className="hackathon-chat__error" role="alert">
          {error}
        </div>
      ) : null}
      <form className="hackathon-chat__composer" onSubmit={submit}>
        <label className="sr-only" htmlFor={`${product}-chat-input`}>
          پیام
        </label>
        <textarea
          id={`${product}-chat-input`}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          maxLength={8000}
          rows={2}
          placeholder="پیام خود را بنویسید…"
          disabled={status === "loading"}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {status === "streaming" ? (
          <button type="button" onClick={() => abortRef.current?.abort()}>
            توقف
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || status === "loading"}
          >
            ارسال
          </button>
        )}
      </form>
    </section>
  );
}
