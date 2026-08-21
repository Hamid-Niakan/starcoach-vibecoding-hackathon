import type {
  BrowserChatMessageV2,
  BrowserFeedback,
  ConversationPreferences,
  LiaraAssistantMetadataV1,
  OpenAIChatMessage,
} from "@hackathon/contracts";
import { workflowReducer } from "./workflow-reducer.js";

export interface ConversationState {
  model: string | null;
  messages: BrowserChatMessageV2[];
  preferences: ConversationPreferences;
  activeWorkflow: import("@hackathon/contracts").ActiveWorkflow | null;
  feedback: BrowserFeedback[];
}

export type ConversationAction =
  | { type: "state.restored"; state: ConversationState }
  | { type: "model.discovered"; model: string }
  | {
      type: "turn.started";
      turnId: string;
      userId: string;
      assistantId: string;
      content: string;
      createdAt: string;
    }
  | {
      type: "turn.retried";
      turnId: string;
      assistantId: string;
      createdAt: string;
    }
  | { type: "assistant.delta"; turnId: string; content: string }
  | {
      type: "assistant.completed";
      turnId: string;
      metadata: LiaraAssistantMetadataV1;
      requestId?: string;
    }
  | { type: "assistant.stopped"; turnId: string; requestId?: string }
  | {
      type: "assistant.failed";
      turnId: string;
      code: string;
      requestId?: string;
    }
  | { type: "preferences.set"; preferences: ConversationPreferences }
  | {
      type: "workflow.step_completed";
      stepId: string;
      confirmedByUser: boolean;
      updatedAt: string;
    }
  | {
      type: "feedback.set";
      assistantMessageId: string;
      value: BrowserFeedback["value"];
      reason?: BrowserFeedback["reason"];
      createdAt: string;
    }
  | { type: "conversation.cleared" };

export function createInitialConversationState(): ConversationState {
  return {
    model: null,
    messages: [],
    preferences: {
      language: "auto",
      experience: "unknown",
      service: null,
      explicit: [],
    },
    activeWorkflow: null,
    feedback: [],
  };
}

function assertNoActiveStream(messages: BrowserChatMessageV2[]): void {
  if (messages.some((message) => message.status === "streaming"))
    throw new Error("Only one chat stream may be active.");
}

function updateAssistant(
  messages: BrowserChatMessageV2[],
  turnId: string,
  update: (message: BrowserChatMessageV2) => BrowserChatMessageV2,
): BrowserChatMessageV2[] {
  let found = false;
  const next = messages.map((message) => {
    if (message.role !== "assistant" || message.turnId !== turnId)
      return message;
    found = true;
    return update(message);
  });
  if (!found) throw new Error(`Unknown assistant turn: ${turnId}`);
  return next;
}

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction,
): ConversationState {
  switch (action.type) {
    case "state.restored":
      return action.state;
    case "model.discovered":
      return { ...state, model: action.model };
    case "turn.started": {
      assertNoActiveStream(state.messages);
      const base = { turnId: action.turnId, createdAt: action.createdAt };
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            ...base,
            id: action.userId,
            role: "user",
            content: action.content,
            status: "completed",
          },
          {
            ...base,
            id: action.assistantId,
            role: "assistant",
            content: "",
            status: "streaming",
          },
        ],
      };
    }
    case "turn.retried": {
      assertNoActiveStream(state.messages);
      const userIndex = state.messages.findIndex(
        (message) =>
          message.role === "user" && message.turnId === action.turnId,
      );
      if (userIndex < 0) throw new Error(`Unknown user turn: ${action.turnId}`);
      const messages = state.messages.filter(
        (message) =>
          !(message.role === "assistant" && message.turnId === action.turnId),
      );
      messages.splice(userIndex + 1, 0, {
        id: action.assistantId,
        turnId: action.turnId,
        role: "assistant",
        content: "",
        status: "streaming",
        createdAt: action.createdAt,
      });
      return { ...state, messages };
    }
    case "assistant.delta":
      return {
        ...state,
        messages: updateAssistant(state.messages, action.turnId, (message) => {
          if (message.status !== "streaming")
            throw new Error("Deltas require an active stream.");
          return { ...message, content: message.content + action.content };
        }),
      };
    case "assistant.completed":
      return {
        ...state,
        messages: updateAssistant(state.messages, action.turnId, (message) => ({
          ...message,
          status: "completed",
          metadata: action.metadata,
          ...(action.requestId ? { requestId: action.requestId } : {}),
        })),
        activeWorkflow: action.metadata.workflow
          ? {
              ...action.metadata.workflow,
              sourceTurnId: action.turnId,
              updatedAt: new Date().toISOString(),
            }
          : action.metadata.intent.topic_changed
            ? null
            : state.activeWorkflow,
      };
    case "assistant.stopped":
      return {
        ...state,
        messages: updateAssistant(state.messages, action.turnId, (message) => ({
          ...message,
          status: "stopped",
          ...(action.requestId ? { requestId: action.requestId } : {}),
        })),
      };
    case "assistant.failed":
      return {
        ...state,
        messages: updateAssistant(state.messages, action.turnId, (message) => ({
          ...message,
          status: "failed",
          errorCode: action.code,
          ...(action.requestId ? { requestId: action.requestId } : {}),
        })),
      };
    case "feedback.set": {
      const message = state.messages.find(
        (candidate) =>
          candidate.id === action.assistantMessageId &&
          candidate.role === "assistant" &&
          candidate.status === "completed",
      );
      if (!message)
        throw new Error("Feedback requires a completed assistant message.");
      const feedback = state.feedback.filter(
        (entry) => entry.assistantMessageId !== action.assistantMessageId,
      );
      feedback.push({
        assistantMessageId: action.assistantMessageId,
        value: action.value,
        ...(action.reason ? { reason: action.reason } : {}),
        createdAt: action.createdAt,
      });
      return { ...state, feedback };
    }
    case "preferences.set":
      return { ...state, preferences: action.preferences };
    case "workflow.step_completed":
      return {
        ...state,
        activeWorkflow: workflowReducer(state.activeWorkflow, {
          type: "step.completed",
          stepId: action.stepId,
          confirmedByUser: action.confirmedByUser,
          updatedAt: action.updatedAt,
        }),
      };
    case "conversation.cleared":
      return { ...createInitialConversationState(), model: state.model };
  }
}

export function projectVisibleContext(
  messages: BrowserChatMessageV2[],
): OpenAIChatMessage[] {
  return messages.flatMap((message): OpenAIChatMessage[] => {
    if (message.role === "user")
      return [{ role: "user", content: message.content }];
    if (
      (message.status === "completed" || message.status === "stopped") &&
      message.content
    )
      return [{ role: "assistant", content: message.content }];
    return [];
  });
}
