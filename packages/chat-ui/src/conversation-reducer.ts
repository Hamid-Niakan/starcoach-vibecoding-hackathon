import type { BrowserChatMessage, OpenAIChatMessage } from "@hackathon/contracts";

export interface ConversationState {
  model: string | null;
  messages: BrowserChatMessage[];
}

export type ConversationAction =
  | { type: "state.restored"; state: ConversationState }
  | { type: "model.discovered"; model: string }
  | { type: "turn.started"; turnId: string; userId: string; assistantId: string; content: string; createdAt: string }
  | { type: "turn.retried"; turnId: string; assistantId: string; createdAt: string }
  | { type: "assistant.delta"; turnId: string; content: string }
  | { type: "assistant.completed"; turnId: string; requestId?: string }
  | { type: "assistant.stopped"; turnId: string; requestId?: string }
  | { type: "assistant.failed"; turnId: string; code: string; requestId?: string };

export function createInitialConversationState(): ConversationState {
  return { model: null, messages: [] };
}

function assertNoActiveStream(messages: BrowserChatMessage[]): void {
  if (messages.some((message) => message.status === "streaming")) throw new Error("Only one chat stream may be active.");
}

function updateAssistant(
  messages: BrowserChatMessage[],
  turnId: string,
  update: (message: BrowserChatMessage) => BrowserChatMessage,
): BrowserChatMessage[] {
  let found = false;
  const next = messages.map((message) => {
    if (message.role !== "assistant" || message.turnId !== turnId) return message;
    found = true;
    return update(message);
  });
  if (!found) throw new Error(`Unknown assistant turn: ${turnId}`);
  return next;
}

export function conversationReducer(state: ConversationState, action: ConversationAction): ConversationState {
  switch (action.type) {
    case "state.restored": return action.state;
    case "model.discovered": return { ...state, model: action.model };
    case "turn.started": {
      assertNoActiveStream(state.messages);
      const base = { turnId: action.turnId, createdAt: action.createdAt };
      return { ...state, messages: [...state.messages,
        { ...base, id: action.userId, role: "user", content: action.content, status: "completed" },
        { ...base, id: action.assistantId, role: "assistant", content: "", status: "streaming" },
      ] };
    }
    case "turn.retried": {
      assertNoActiveStream(state.messages);
      const userIndex = state.messages.findIndex((message) => message.role === "user" && message.turnId === action.turnId);
      if (userIndex < 0) throw new Error(`Unknown user turn: ${action.turnId}`);
      const messages = state.messages.filter((message) => !(message.role === "assistant" && message.turnId === action.turnId));
      messages.splice(userIndex + 1, 0, { id: action.assistantId, turnId: action.turnId, role: "assistant", content: "", status: "streaming", createdAt: action.createdAt });
      return { ...state, messages };
    }
    case "assistant.delta": return { ...state, messages: updateAssistant(state.messages, action.turnId, (message) => {
      if (message.status !== "streaming") throw new Error("Deltas require an active stream.");
      return { ...message, content: message.content + action.content };
    }) };
    case "assistant.completed": return { ...state, messages: updateAssistant(state.messages, action.turnId, (message) => ({ ...message, status: "completed", ...(action.requestId ? { requestId: action.requestId } : {}) })) };
    case "assistant.stopped": return { ...state, messages: updateAssistant(state.messages, action.turnId, (message) => ({ ...message, status: "stopped", ...(action.requestId ? { requestId: action.requestId } : {}) })) };
    case "assistant.failed": return { ...state, messages: updateAssistant(state.messages, action.turnId, (message) => ({ ...message, status: "failed", errorCode: action.code, ...(action.requestId ? { requestId: action.requestId } : {}) })) };
  }
}

export function projectVisibleContext(messages: BrowserChatMessage[]): OpenAIChatMessage[] {
  return messages.flatMap((message): OpenAIChatMessage[] => {
    if (message.role === "user") return [{ role: "user", content: message.content }];
    if ((message.status === "completed" || message.status === "stopped") && message.content) return [{ role: "assistant", content: message.content }];
    return [];
  });
}
