"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GatewayClient, GatewayClientError } from "@hackathon/api-client";
import type { BrowserFeedback, OpenAIChatMessage } from "@hackathon/contracts";

import {
  conversationReducer,
  createInitialConversationState,
  type ConversationAction,
  type ConversationState,
} from "./conversation-reducer.js";
import { selectConversationContext } from "./context-selector.js";
import {
  LIARA_CHAT_STORAGE_KEY,
  loadChatState,
  saveChatState,
} from "./session-storage.js";

export type ChatControllerStatus =
  | "discovering"
  | "ready"
  | "streaming"
  | "error";
export interface LiaraChatController {
  state: ConversationState;
  status: ChatControllerStatus;
  announcement: string;
  error: string;
  input: string;
  setInput(value: string): void;
  reconnect(): void;
  submit(): Promise<void>;
  cancel(): void;
  retry(turnId: string): Promise<void>;
  clear(): void;
  setFeedback(
    assistantMessageId: string,
    value: BrowserFeedback["value"],
    reason?: BrowserFeedback["reason"],
  ): void;
  setPreferences(
    preferences: import("@hackathon/contracts").ConversationPreferences,
  ): void;
  confirmWorkflowStep(stepId: string): void;
}

const safeUuid = (value: string | undefined): string | undefined =>
  value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : undefined;

export function persianRecovery(error: unknown): {
  message: string;
  code: string;
  requestId?: string;
} {
  if (error instanceof TypeError)
    return {
      message:
        "درگاه گفتگو در دسترس نیست. وضعیت راه‌اندازی را بررسی کنید یا دوباره تلاش کنید.",
      code: "gateway_unreachable",
    };
  if (!(error instanceof GatewayClientError))
    return {
      message: "خطای پیش‌بینی‌نشده‌ای رخ داد. دوباره تلاش کنید.",
      code: "unknown",
    };
  const details = { code: error.code, requestId: safeUuid(error.requestId) };
  if (
    error.status === 400 ||
    (error.code.includes("invalid") && error.code !== "invalid_stream")
  )
    return {
      ...details,
      message: "درخواست قابل پردازش نیست. متن یا مدل را بررسی کنید.",
    };
  if (error.status === 429 || /rate|quota/.test(error.code))
    return {
      ...details,
      message: "سهمیه یا نرخ درخواست پر شده است. کمی بعد دوباره تلاش کنید.",
    };
  if (error.status === 503 || /not_ready/.test(error.code))
    return {
      ...details,
      message: "درگاه هنوز آماده نیست. چند لحظه دیگر دوباره تلاش کنید.",
    };
  if (error.status === 504 || /timeout/.test(error.code))
    return { ...details, message: "زمان پاسخ‌گویی تمام شد. دوباره تلاش کنید." };
  if (error.status === 502 || /upstream/.test(error.code))
    return {
      ...details,
      message: "سرویس پاسخ‌گو موقتاً در دسترس نیست. دوباره تلاش کنید.",
    };
  if (/incomplete_stream/.test(error.code))
    return {
      ...details,
      message: "پاسخ پیش از تکمیل قطع شد. می‌توانید دوباره تلاش کنید.",
    };
  return { ...details, message: "پاسخ معتبری دریافت نشد. دوباره تلاش کنید." };
}

export function useLiaraChat(
  gatewayUrl: string,
  storageKey = LIARA_CHAT_STORAGE_KEY,
): LiaraChatController {
  const client = useMemo(() => new GatewayClient(gatewayUrl), [gatewayUrl]);
  const [state, setReactState] = useState<ConversationState>(
    createInitialConversationState,
  );
  const stateRef = useRef(state);
  const [status, setStatus] = useState<ChatControllerStatus>("discovering");
  const [announcement, setAnnouncement] = useState("در حال آماده‌سازی گفتگو");
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const hydratedRef = useRef(false);
  const [discoveryAttempt, setDiscoveryAttempt] = useState(0);
  const dispatch = useCallback((action: ConversationAction) => {
    const next = conversationReducer(stateRef.current, action);
    stateRef.current = next;
    setReactState(next);
    return next;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) {
      const restored = loadChatState(window.sessionStorage, storageKey);
      if (restored) dispatch({ type: "state.restored", state: restored });
      hydratedRef.current = true;
    }
    const controller = new AbortController();
    let retryTimer: number | undefined;
    setStatus("discovering");
    setAnnouncement("در حال اتصال به درگاه گفتگو");
    client
      .discoverModel(controller.signal)
      .then((model) => {
        dispatch({ type: "model.discovered", model: model.id });
        setError("");
        setStatus("ready");
        setAnnouncement("گفتگو آماده است");
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const recovery = persianRecovery(cause);
        setError(recovery.message);
        setStatus("error");
        setAnnouncement("آماده‌سازی گفتگو ناموفق بود");
        retryTimer = window.setTimeout(
          () => setDiscoveryAttempt((attempt) => attempt + 1),
          5_000,
        );
      });
    return () => {
      controller.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [client, discoveryAttempt, dispatch, storageKey]);

  useEffect(() => {
    if (hydratedRef.current)
      saveChatState(window.sessionStorage, storageKey, state);
  }, [state, storageKey]);

  const run = useCallback(
    async (turnId: string, messages: OpenAIChatMessage[]) => {
      const model = stateRef.current.model;
      if (!model) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("streaming");
      setAnnouncement("در حال دریافت پاسخ");
      setError("");
      let metadata:
        | import("@hackathon/contracts").LiaraAssistantMetadataV1
        | undefined;
      let requestId: string | undefined;
      try {
        for await (const event of client.streamLiara(
          { model, messages, stream: true },
          controller.signal,
        )) {
          requestId = event.requestId ?? requestId;
          if (event.type === "metadata") {
            metadata = event.metadata;
            continue;
          }
          for (const choice of event.chunk.choices)
            if (choice.delta.content)
              dispatch({
                type: "assistant.delta",
                turnId,
                content: choice.delta.content,
              });
        }
        const assistant = stateRef.current.messages.find(
          (message) =>
            message.role === "assistant" && message.turnId === turnId,
        );
        if (!assistant?.content)
          throw new GatewayClientError("Empty response", 502, "invalid_stream");
        if (!metadata)
          throw new GatewayClientError(
            "Missing Liara metadata",
            502,
            "missing_liara_metadata",
            requestId,
          );
        dispatch({ type: "assistant.completed", turnId, metadata, requestId });
        setStatus("ready");
        setAnnouncement(
          `پاسخ کامل شد؛ ${metadata.citations.length.toLocaleString("fa-IR")} منبع`,
        );
      } catch (cause) {
        if (controller.signal.aborted) {
          dispatch({ type: "assistant.stopped", turnId });
          setStatus("ready");
          setAnnouncement("پاسخ متوقف شد");
          setError("");
        } else {
          const recovery = persianRecovery(cause);
          dispatch({
            type: "assistant.failed",
            turnId,
            code: recovery.code,
            requestId: recovery.requestId,
          });
          setError(
            `${recovery.message}${recovery.requestId ? ` شناسه پیگیری: ${recovery.requestId}` : ""}`,
          );
          setStatus("error");
          setAnnouncement("دریافت پاسخ ناموفق بود");
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [client, dispatch],
  );

  const submit = useCallback(async () => {
    const content = input.trim();
    if (!content || status === "streaming" || !stateRef.current.model) return;
    const turnId = crypto.randomUUID();
    dispatch({
      type: "turn.started",
      turnId,
      userId: crypto.randomUUID(),
      assistantId: crypto.randomUUID(),
      content,
      createdAt: new Date().toISOString(),
    });
    setInput("");
    const prior = stateRef.current.messages.filter(
      (message) => !(message.role === "assistant" && message.turnId === turnId),
    );
    await run(
      turnId,
      selectConversationContext(prior, stateRef.current.preferences).messages,
    );
  }, [dispatch, input, run, status]);

  const retry = useCallback(
    async (turnId: string) => {
      if (status === "streaming" || !stateRef.current.model) return;
      const user = stateRef.current.messages.find(
        (message) => message.role === "user" && message.turnId === turnId,
      );
      if (!user) return;
      const context = selectConversationContext(
        stateRef.current.messages.filter(
          (message) =>
            !(message.role === "assistant" && message.turnId === turnId),
        ),
        stateRef.current.preferences,
      ).messages;
      dispatch({
        type: "turn.retried",
        turnId,
        assistantId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      });
      await run(turnId, context);
    },
    [dispatch, run, status],
  );

  return {
    state,
    status,
    announcement,
    error,
    input,
    setInput,
    reconnect: () => setDiscoveryAttempt((attempt) => attempt + 1),
    submit,
    cancel: () => abortRef.current?.abort(),
    retry,
    clear: () => {
      dispatch({ type: "conversation.cleared" });
      setInput("");
      setError("");
      setStatus("ready");
      setAnnouncement("گفتگوی تازه آماده است");
    },
    setFeedback: (assistantMessageId, value, reason) =>
      dispatch({
        type: "feedback.set",
        assistantMessageId,
        value,
        ...(reason ? { reason } : {}),
        createdAt: new Date().toISOString(),
      }),
    setPreferences: (preferences) =>
      dispatch({ type: "preferences.set", preferences }),
    confirmWorkflowStep: (stepId) =>
      dispatch({
        type: "workflow.step_completed",
        stepId,
        confirmedByUser: true,
        updatedAt: new Date().toISOString(),
      }),
  };
}
