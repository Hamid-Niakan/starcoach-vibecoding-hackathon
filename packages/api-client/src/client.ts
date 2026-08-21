import {
  chatCompletionResponseSchema,
  modelListResponseSchema,
  streamingChatCompletionRequestSchema,
  type ChatCompletion,
  type ChatCompletionRequest,
  type ChatCompletionChunk,
  type PublicModel,
  type StreamingChatCompletionRequest,
} from "@hackathon/contracts";

import {
  errorFromResponse,
  GatewayClientError,
  requestIdFrom,
} from "./errors.js";
import {
  parseLiaraOpenAIStream,
  parseOpenAIStream,
  type LiaraStreamEvent,
  type StreamLimits,
} from "./sse.js";

export function normalizeGatewayOrigin(input: string): string {
  const url = new URL(input);
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new TypeError(
      "Gateway URL must be an HTTP(S) origin without credentials, path, query, or fragment.",
    );
  }
  return url.origin;
}

export interface GatewayClientOptions {
  fetch?: typeof fetch;
  authorizationPlaceholder?: string;
  streamLimits?: Partial<StreamLimits>;
}

export class GatewayClient {
  private readonly origin: string;
  private readonly fetcher: typeof fetch;

  constructor(
    origin: string,
    private readonly options: GatewayClientOptions = {},
  ) {
    this.origin = normalizeGatewayOrigin(origin);
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  private headers(json = false): Headers {
    const headers = new Headers();
    if (json) headers.set("content-type", "application/json");
    if (this.options.authorizationPlaceholder)
      headers.set(
        "authorization",
        `Bearer ${this.options.authorizationPlaceholder}`,
      );
    return headers;
  }

  async discoverModel(signal?: AbortSignal): Promise<PublicModel> {
    const headers = this.headers();
    const response = await this.fetcher(`${this.origin}/v1/models`, {
      method: "GET",
      ...(this.options.authorizationPlaceholder ? { headers } : {}),
      signal,
    });
    if (!response.ok) throw await errorFromResponse(response);
    const json: unknown = await response.json().catch(() => undefined);
    const parsed = modelListResponseSchema.safeParse(json);
    if (!parsed.success)
      throw new GatewayClientError(
        "فهرست مدل‌ها معتبر نیست.",
        response.status,
        "invalid_response",
        requestIdFrom(response),
      );
    return parsed.data.data[0]!;
  }

  async complete(
    request: Omit<ChatCompletionRequest, "stream">,
    signal?: AbortSignal,
  ): Promise<ChatCompletion> {
    const response = await this.fetcher(`${this.origin}/v1/chat/completions`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ ...request, stream: false }),
      signal,
    });
    if (!response.ok) throw await errorFromResponse(response);
    const parsed = chatCompletionResponseSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    if (!parsed.success)
      throw new GatewayClientError(
        "پاسخ درگاه معتبر نیست.",
        response.status,
        "invalid_response",
        requestIdFrom(response),
      );
    return parsed.data;
  }

  async *stream(
    request: StreamingChatCompletionRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatCompletionChunk> {
    const parsedRequest = streamingChatCompletionRequestSchema.parse(request);
    const response = await this.fetcher(`${this.origin}/v1/chat/completions`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(parsedRequest),
      signal,
    });
    if (!response.ok) throw await errorFromResponse(response);
    for await (const chunk of parseOpenAIStream(response, {
      signal,
      limits: this.options.streamLimits,
    }))
      yield chunk;
  }

  async *streamLiara(
    request: StreamingChatCompletionRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<LiaraStreamEvent> {
    const parsedRequest = streamingChatCompletionRequestSchema.parse(request);
    const response = await this.fetcher(`${this.origin}/v1/chat/completions`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(parsedRequest),
      signal,
    });
    if (!response.ok) throw await errorFromResponse(response);
    for await (const event of parseLiaraOpenAIStream(response, {
      signal,
      limits: this.options.streamLimits,
    }))
      yield event;
  }
}
