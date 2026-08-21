import { openAIErrorResponseSchema } from "@hackathon/contracts";

export type GatewayErrorCode =
  | "invalid_response"
  | "invalid_stream"
  | "incomplete_stream"
  | "stream_limit_exceeded"
  | string;

export class GatewayClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: GatewayErrorCode,
    public readonly requestId?: string,
    public readonly type = "client_error",
    public readonly param: string | null = null,
  ) {
    super(message);
    this.name = "GatewayClientError";
  }
}

export function requestIdFrom(response: Response): string | undefined {
  const value = response.headers.get("x-request-id") ?? undefined;
  return value && value.length <= 128 ? value : undefined;
}

export async function errorFromResponse(
  response: Response,
): Promise<GatewayClientError> {
  const requestId = requestIdFrom(response);
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = openAIErrorResponseSchema.safeParse(body);
  if (!parsed.success) {
    return new GatewayClientError(
      "پاسخ امن و معتبری از درگاه دریافت نشد.",
      response.status,
      "invalid_response",
      requestId,
    );
  }
  const { message, code, type, param } = parsed.data.error;
  return new GatewayClientError(
    message,
    response.status,
    code,
    requestId,
    type,
    param,
  );
}
