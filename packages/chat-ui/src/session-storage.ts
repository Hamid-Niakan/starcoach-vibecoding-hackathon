import {
  BROWSER_CHAT_STATE_VERSION,
  browserChatStateSchema,
  normalizeRestoredBrowserChatState,
  type BrowserChatState,
} from "@hackathon/contracts";

export const LIARA_CHAT_STORAGE_KEY = "hackathon:liara-chat:v1";

export function storageKeyFor(product: "liara"): string {
  return product === "liara" ? LIARA_CHAT_STORAGE_KEY : LIARA_CHAT_STORAGE_KEY;
}

export function loadChatState(storage: Storage, key = LIARA_CHAT_STORAGE_KEY): BrowserChatState | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    const parsed = browserChatStateSchema.parse(value);
    return normalizeRestoredBrowserChatState(parsed);
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function saveChatState(
  storage: Storage,
  key: string,
  state: Omit<BrowserChatState, "version" | "updatedAt"> & Partial<Pick<BrowserChatState, "version" | "updatedAt">>,
): boolean {
  const candidate = browserChatStateSchema.safeParse({
    ...state,
    version: BROWSER_CHAT_STATE_VERSION,
    updatedAt: state.updatedAt ?? new Date().toISOString(),
  });
  if (!candidate.success) return false;
  try {
    storage.setItem(key, JSON.stringify(candidate.data));
    return true;
  } catch {
    return false;
  }
}
