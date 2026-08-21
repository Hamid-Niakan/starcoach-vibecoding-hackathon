import {
  browserChatStateV2Schema,
  browserChatStateSchema,
  migrateBrowserChatStateV1,
  normalizeRestoredBrowserChatStateV2,
  type BrowserChatStateV2,
} from "@hackathon/contracts";

export const LIARA_CHAT_STORAGE_KEY = "hackathon:liara-chat:v2";
export const LEGACY_LIARA_CHAT_STORAGE_KEY = "hackathon:liara-chat:v1";

export function storageKeyFor(product: "liara"): string {
  return product === "liara" ? LIARA_CHAT_STORAGE_KEY : LIARA_CHAT_STORAGE_KEY;
}

export function loadChatState(
  storage: Storage,
  key = LIARA_CHAT_STORAGE_KEY,
): BrowserChatStateV2 | null {
  const raw =
    storage.getItem(key) ??
    (key === LIARA_CHAT_STORAGE_KEY
      ? storage.getItem(LEGACY_LIARA_CHAT_STORAGE_KEY)
      : null);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    const version =
      typeof value === "object" && value !== null && "version" in value
        ? (value as { version?: unknown }).version
        : undefined;
    const state =
      version === 1
        ? migrateBrowserChatStateV1(browserChatStateSchema.parse(value))
        : normalizeRestoredBrowserChatStateV2(value);
    if (key === LIARA_CHAT_STORAGE_KEY) {
      storage.setItem(key, JSON.stringify(state));
      storage.removeItem(LEGACY_LIARA_CHAT_STORAGE_KEY);
    }
    return state;
  } catch {
    storage.removeItem(key);
    if (key === LIARA_CHAT_STORAGE_KEY)
      storage.removeItem(LEGACY_LIARA_CHAT_STORAGE_KEY);
    return null;
  }
}

export function saveChatState(
  storage: Storage,
  key: string,
  state: unknown,
): boolean {
  if (typeof state !== "object" || state === null) return false;
  const value = state as Record<string, unknown>;
  if (
    Array.isArray(value.messages) &&
    value.messages.some(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        (message as { status?: unknown }).status === "streaming",
    )
  )
    return false;
  const candidate = browserChatStateV2Schema.safeParse({
    ...value,
    version: 2,
    updatedAt: value.updatedAt ?? new Date().toISOString(),
  });
  if (!candidate.success) return false;
  try {
    storage.setItem(key, JSON.stringify(candidate.data));
    return true;
  } catch {
    return false;
  }
}
