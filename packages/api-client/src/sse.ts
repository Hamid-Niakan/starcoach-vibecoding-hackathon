import {
  chatCompletionChunkResponseSchema,
  liaraTerminalChunkSchema,
  type ChatCompletionChunk,
  type LiaraAssistantMetadataV1,
} from "@hackathon/contracts";

import { GatewayClientError, requestIdFrom } from "./errors.js";

export interface StreamLimits {
  maxEventBytes: number;
  maxBufferBytes: number;
  maxStreamBytes: number;
  maxEvents: number;
  maxTextBytes: number;
}

export const DEFAULT_STREAM_LIMITS: Readonly<StreamLimits> = Object.freeze({
  maxEventBytes: 256 * 1024,
  maxBufferBytes: 512 * 1024,
  maxStreamBytes: 64 * 1024 * 1024,
  maxEvents: 100_000,
  maxTextBytes: 1024 * 1024,
});

export interface ParseStreamOptions {
  signal?: AbortSignal;
  limits?: Partial<StreamLimits>;
}

export type LiaraStreamEvent =
  | { type: "chunk"; chunk: ChatCompletionChunk; requestId?: string }
  | {
      type: "metadata";
      metadata: LiaraAssistantMetadataV1;
      requestId?: string;
    };

const bytes = (value: string) => new TextEncoder().encode(value).byteLength;

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

export async function* parseOpenAIStream(
  response: Response,
  options: ParseStreamOptions = {},
): AsyncGenerator<ChatCompletionChunk> {
  if (!response.body) {
    throw new GatewayClientError(
      "جریان پاسخ در دسترس نیست.",
      response.status,
      "invalid_stream",
      requestIdFrom(response),
    );
  }
  const limits = { ...DEFAULT_STREAM_LIMITS, ...options.limits };
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const requestId = requestIdFrom(response);
  let buffer = "";
  let streamBytes = 0;
  let eventCount = 0;
  let textBytes = 0;
  let terminal = false;
  const onAbort = () =>
    void reader.cancel(options.signal?.reason).catch(() => undefined);
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    if (options.signal?.aborted) throw abortError();
    while (!terminal) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (cause) {
        if (options.signal?.aborted) throw abortError();
        throw cause;
      }
      if (options.signal?.aborted) throw abortError();
      if (result.done) {
        buffer += decoder.decode();
        break;
      }
      streamBytes += result.value.byteLength;
      if (streamBytes > limits.maxStreamBytes) {
        throw new GatewayClientError(
          "حجم جریان پاسخ بیش از حد مجاز است.",
          200,
          "stream_limit_exceeded",
          requestId,
        );
      }
      try {
        buffer += decoder.decode(result.value, { stream: true });
      } catch {
        throw new GatewayClientError(
          "رمزگذاری جریان پاسخ معتبر نیست.",
          200,
          "invalid_stream",
          requestId,
        );
      }
      if (bytes(buffer) > limits.maxBufferBytes) {
        throw new GatewayClientError(
          "بافر جریان پاسخ بیش از حد مجاز است.",
          200,
          "stream_limit_exceeded",
          requestId,
        );
      }

      while (true) {
        const boundary = /\r?\n\r?\n/.exec(buffer);
        if (!boundary?.index && boundary?.index !== 0) break;
        const rawEvent = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        if (bytes(rawEvent) > limits.maxEventBytes) {
          throw new GatewayClientError(
            "رویداد جریان پاسخ بیش از حد مجاز است.",
            200,
            "stream_limit_exceeded",
            requestId,
          );
        }
        const data = rawEvent
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data) continue;
        if (data === "[DONE]") {
          terminal = true;
          await reader.cancel();
          break;
        }
        eventCount += 1;
        if (eventCount > limits.maxEvents) {
          throw new GatewayClientError(
            "تعداد رویدادهای پاسخ بیش از حد مجاز است.",
            200,
            "stream_limit_exceeded",
            requestId,
          );
        }
        let json: unknown;
        try {
          json = JSON.parse(data);
        } catch {
          throw new GatewayClientError(
            "قالب جریان پاسخ معتبر نیست.",
            200,
            "invalid_stream",
            requestId,
          );
        }
        const parsed = chatCompletionChunkResponseSchema.safeParse(json);
        if (!parsed.success) {
          throw new GatewayClientError(
            "ساختار جریان پاسخ معتبر نیست.",
            200,
            "invalid_stream",
            requestId,
          );
        }
        for (const choice of parsed.data.choices) {
          const content = choice.delta.content;
          if (content) textBytes += bytes(content);
        }
        if (textBytes > limits.maxTextBytes) {
          throw new GatewayClientError(
            "متن پاسخ بیش از حد مجاز است.",
            200,
            "stream_limit_exceeded",
            requestId,
          );
        }
        yield parsed.data;
      }
    }
    if (!terminal) {
      throw new GatewayClientError(
        "جریان پاسخ پیش از تکمیل قطع شد.",
        200,
        "incomplete_stream",
        requestId,
      );
    }
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    if (!terminal) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/**
 * Adds the Liara grounding profile to the otherwise generic OpenAI stream.
 * Ordinary provider extensions remain opaque; only `x_liara` is interpreted.
 */
export async function* parseLiaraOpenAIStream(
  response: Response,
  options: ParseStreamOptions = {},
): AsyncGenerator<LiaraStreamEvent> {
  const requestId = requestIdFrom(response);
  let terminalSeen = false;
  for await (const chunk of parseOpenAIStream(response, options)) {
    if (!("x_liara" in chunk)) {
      yield { type: "chunk", chunk, ...(requestId ? { requestId } : {}) };
      continue;
    }
    if (terminalSeen) {
      throw new GatewayClientError(
        "فراداده پایانی تکراری است.",
        200,
        "duplicate_liara_metadata",
        requestId,
      );
    }
    const parsed = liaraTerminalChunkSchema.safeParse(chunk);
    if (!parsed.success) {
      throw new GatewayClientError(
        "فراداده منابع پاسخ معتبر نیست.",
        200,
        "invalid_liara_metadata",
        requestId,
      );
    }
    terminalSeen = true;
    yield {
      type: "metadata",
      metadata: parsed.data.x_liara,
      ...(requestId ? { requestId } : {}),
    };
  }
  if (!terminalSeen) {
    throw new GatewayClientError(
      "فراداده منابع پاسخ دریافت نشد.",
      200,
      "missing_liara_metadata",
      requestId,
    );
  }
}
