import {
  chatStreamEventSchema,
  conversationSchema,
  createConversationResponseSchema,
  type ChatStreamEvent,
  type Conversation,
  type CreateConversationResponse,
  type Product,
} from "@hackathon/contracts";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface ConversationCredentials {
  conversationId: string;
  accessToken: string;
}

export class HackathonApiClient {
  constructor(private readonly baseUrl: string) {}

  async createConversation(
    product: Product,
  ): Promise<CreateConversationResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/${product}/conversations`,
      { method: "POST" },
    );
    return createConversationResponseSchema.parse(
      await this.readJson(response),
    );
  }

  async getConversation(
    product: Product,
    credentials: ConversationCredentials,
  ): Promise<Conversation> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/${product}/conversations/${credentials.conversationId}`,
      {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      },
    );
    return conversationSchema.parse(await this.readJson(response));
  }

  async *sendMessage(
    product: Product,
    credentials: ConversationCredentials,
    content: string,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/${product}/conversations/${credentials.conversationId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
        signal,
      },
    );
    if (!response.ok || !response.body)
      throw new ApiClientError(response.status, await response.text());

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame
          .split("\n")
          .find((line) => line.startsWith("data:"))
          ?.slice(5)
          .trim();
        if (data) yield chatStreamEventSchema.parse(JSON.parse(data));
      }
      if (done) break;
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    const body = await response
      .json()
      .catch(() => ({ message: response.statusText }));
    if (!response.ok)
      throw new ApiClientError(response.status, JSON.stringify(body));
    return body;
  }
}
