"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChatEmptyState } from "./ChatEmptyState.js";
import { CitationList } from "./CitationList.js";
import { FeedbackControls } from "./FeedbackControls.js";
import { ConversationPreferences } from "./ConversationPreferences.js";
import { NewConversationButton } from "./NewConversationButton.js";
import { NextStepActions } from "./NextStepActions.js";
import { TechnicalMarkdown } from "./TechnicalMarkdown.js";
import { WorkflowCard } from "./WorkflowCard.js";
import { useLiaraChat } from "./use-liara-chat.js";

export interface ChatPanelProps {
  gatewayUrl: string;
  storageKey?: string;
  title?: string;
  description?: string;
  className?: string;
}

function scrollLatest(element: HTMLDivElement) {
  const behavior =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
  if (typeof element.scrollTo === "function")
    element.scrollTo({ top: element.scrollHeight, behavior });
  else element.scrollTop = element.scrollHeight;
}

export function ChatPanel({
  gatewayUrl,
  storageKey,
  title = "دستیار مستندات لیارا",
  description = "پرسش فنی خود را درباره سرویس‌های لیارا مطرح کنید.",
  className,
}: ChatPanelProps) {
  const chat = useLiaraChat(gatewayUrl, storageKey);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const wasStreaming = useRef(false);
  const initiatedBy = useRef<"composer" | "retry" | null>(null);
  const nearBottom = useRef(true);
  const [newResponse, setNewResponse] = useState(false);
  useEffect(() => {
    if (
      wasStreaming.current &&
      chat.status !== "streaming" &&
      initiatedBy.current === "composer"
    )
      inputRef.current?.focus();
    if (chat.status !== "streaming") initiatedBy.current = null;
    wasStreaming.current = chat.status === "streaming";
  }, [chat.status]);
  useEffect(() => {
    const element = messagesRef.current;
    if (!element || chat.status !== "streaming") return;
    if (nearBottom.current) scrollLatest(element);
    else setNewResponse(true);
  }, [chat.state.messages, chat.status]);
  function submit(event: FormEvent) {
    event.preventDefault();
    initiatedBy.current = "composer";
    void chat.submit();
  }
  function jumpToLatest() {
    const element = messagesRef.current;
    if (!element) return;
    scrollLatest(element);
    nearBottom.current = true;
    setNewResponse(false);
  }
  return (
    <section
      className={`hackathon-chat ${className ?? ""}`}
      dir="rtl"
      aria-label="گفتگو"
      aria-busy={chat.status === "streaming"}
    >
      <header className="hackathon-chat__header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
          <ConversationPreferences
            value={chat.state.preferences}
            onChange={chat.setPreferences}
          />
        </div>
        <div className="hackathon-chat__header-actions">
          <span className="hackathon-chat__badge">مبتنی بر مستندات</span>
          <NewConversationButton
            hasHistory={chat.state.messages.length > 0}
            onConfirm={chat.clear}
          />
        </div>
      </header>
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {chat.announcement}
      </p>
      <div
        ref={messagesRef}
        className="hackathon-chat__messages"
        role="region"
        aria-label="تاریخچه گفتگو"
        onScroll={(event) => {
          const element = event.currentTarget;
          nearBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            80;
          if (nearBottom.current) setNewResponse(false);
        }}
      >
        {chat.state.messages.length === 0 ? (
          <ChatEmptyState
            onChoosePrompt={(prompt) => {
              chat.setInput(prompt);
              inputRef.current?.focus();
            }}
          />
        ) : null}
        {chat.state.messages.map((message) => (
          <article
            key={message.id}
            className={`hackathon-chat__message hackathon-chat__message--${message.role}`}
            data-status={message.status}
          >
            <span>{message.role === "user" ? "شما" : "دستیار"}</span>
            {message.role === "assistant" ? (
              <TechnicalMarkdown content={message.content || "…"} />
            ) : (
              <p dir="auto">{message.content}</p>
            )}
            {message.role === "assistant" && message.metadata ? (
              <>
                <CitationList
                  citations={message.metadata.citations}
                  documentationRevision={
                    message.metadata.documentation_revision
                  }
                />
                <NextStepActions
                  steps={message.metadata.next_steps}
                  onPrompt={(prompt) => {
                    chat.setInput(prompt);
                    inputRef.current?.focus();
                  }}
                />
                <FeedbackControls
                  value={
                    chat.state.feedback.find(
                      (item) => item.assistantMessageId === message.id,
                    )?.value ?? null
                  }
                  reason={
                    chat.state.feedback.find(
                      (item) => item.assistantMessageId === message.id,
                    )?.reason
                  }
                  onChange={(value, reason) =>
                    chat.setFeedback(message.id, value, reason)
                  }
                />
              </>
            ) : null}
            {message.role === "assistant" &&
            (message.status === "stopped" || message.status === "failed") ? (
              <>
                <small>
                  {message.status === "stopped"
                    ? "پاسخ متوقف شد"
                    : "دریافت پاسخ ناموفق بود"}
                </small>
                <button
                  type="button"
                  className="hackathon-chat__retry"
                  onClick={() => {
                    initiatedBy.current = "retry";
                    void chat.retry(message.turnId);
                  }}
                >
                  تلاش دوباره
                </button>
              </>
            ) : null}
          </article>
        ))}
      </div>
      {chat.state.activeWorkflow ? (
        <WorkflowCard
          workflow={chat.state.activeWorkflow}
          onConfirmStep={chat.confirmWorkflowStep}
        />
      ) : null}
      {newResponse ? (
        <button
          type="button"
          className="hackathon-chat__jump"
          onClick={jumpToLatest}
        >
          پاسخ جدید
        </button>
      ) : null}
      {chat.error ? (
        <div className="hackathon-chat__error" role="alert">
          <span>{chat.error}</span>
          {!chat.state.model ? (
            <button type="button" onClick={chat.reconnect}>
              تلاش برای اتصال دوباره
            </button>
          ) : null}
        </div>
      ) : null}
      <form className="hackathon-chat__composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="liara-chat-input">
          پیام
        </label>
        <textarea
          ref={inputRef}
          id="liara-chat-input"
          value={chat.input}
          onChange={(event) => chat.setInput(event.target.value)}
          maxLength={8000}
          rows={2}
          placeholder="پیام خود را بنویسید…"
          disabled={!chat.state.model || chat.status === "discovering"}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {chat.status === "streaming" ? (
          <button type="button" onClick={chat.cancel}>
            توقف
          </button>
        ) : (
          <button
            type="submit"
            disabled={
              !chat.input.trim() ||
              !chat.state.model ||
              chat.status === "discovering"
            }
          >
            ارسال
          </button>
        )}
      </form>
    </section>
  );
}
