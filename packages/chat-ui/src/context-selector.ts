import type {
  BrowserChatMessageV2,
  ConversationPreferences,
  OpenAIChatMessage,
} from "@hackathon/contracts";

export interface ContextLimits {
  maxTurns: number;
  maxCharacters: number;
}
export interface SelectedContext {
  messages: OpenAIChatMessage[];
  topicChanged: boolean;
  selectedTurnIds: string[];
}
const DEFAULT_LIMITS: ContextLimits = { maxTurns: 6, maxCharacters: 12_000 };
const TOPICS: Record<string, string[]> = {
  docker: ["docker", "داکر", "container"],
  database: ["postgres", "mysql", "database", "دیتابیس", "پایگاه"],
  domain: ["domain", "dns", "دامنه"],
  storage: ["storage", "bucket", "ذخیره"],
};

function topic(content: string): string | null {
  const lower = content.toLocaleLowerCase();
  return (
    Object.entries(TOPICS).find(([, terms]) =>
      terms.some((term) => lower.includes(term)),
    )?.[0] ?? null
  );
}

function developerPreference(
  preferences: ConversationPreferences,
): OpenAIChatMessage | null {
  const explicit: Record<string, string> = {};
  for (const key of preferences.explicit) {
    const value = preferences[key];
    if (value !== null) explicit[key] = value;
  }
  return Object.keys(explicit).length
    ? {
        role: "developer",
        content: `Explicit visitor preferences (advisory only): ${JSON.stringify(explicit)}`,
      }
    : null;
}

export function selectConversationContext(
  messages: BrowserChatMessageV2[],
  preferences: ConversationPreferences,
  limits: Partial<ContextLimits> = {},
): SelectedContext {
  const resolved = { ...DEFAULT_LIMITS, ...limits };
  const latestUser = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  if (!latestUser)
    return { messages: [], topicChanged: false, selectedTurnIds: [] };
  const latestTopic = topic(latestUser.content);
  const priorUser = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "user" && message.turnId !== latestUser.turnId,
    );
  const topicChanged = Boolean(
    latestTopic &&
      priorUser &&
      topic(priorUser.content) &&
      latestTopic !== topic(priorUser.content),
  );
  const pairs: Array<{
    turnId: string;
    messages: OpenAIChatMessage[];
    characters: number;
  }> = [];
  for (let index = 0; index < messages.length - 1; index += 1) {
    const user = messages[index];
    const assistant = messages[index + 1];
    if (
      user?.role !== "user" ||
      user.turnId === latestUser.turnId ||
      assistant?.role !== "assistant" ||
      assistant.turnId !== user.turnId
    )
      continue;
    if (
      !(["completed", "stopped"] as const).includes(
        assistant.status as "completed" | "stopped",
      ) ||
      !assistant.content
    )
      continue;
    if (topicChanged && latestTopic && topic(user.content) !== latestTopic)
      continue;
    pairs.push({
      turnId: user.turnId,
      messages: [
        { role: "user", content: user.content },
        { role: "assistant", content: assistant.content },
      ],
      characters: user.content.length + assistant.content.length,
    });
  }
  const selected: typeof pairs = [];
  let characters = latestUser.content.length;
  for (const pair of pairs.reverse()) {
    if (
      selected.length >= resolved.maxTurns - 1 ||
      characters + pair.characters > resolved.maxCharacters
    )
      continue;
    selected.unshift(pair);
    characters += pair.characters;
  }
  const preference = developerPreference(preferences);
  return {
    messages: [
      ...(preference ? [preference] : []),
      ...selected.flatMap((pair) => pair.messages),
      { role: "user", content: latestUser.content },
    ],
    topicChanged,
    selectedTurnIds: [
      ...selected.map((pair) => pair.turnId),
      latestUser.turnId,
    ],
  };
}
