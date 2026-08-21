import { describe, expect, it, vi } from "vitest";

import { GatewayClient, GatewayClientError, normalizeGatewayOrigin } from "./index.js";

const model = { id: "liara-assistant", object: "model", created: 0, owned_by: "ai-gateway" };

describe("GatewayClient", () => {
  it("normalizes an http(s) origin and rejects path-bearing URLs", () => {
    expect(normalizeGatewayOrigin("https://gateway.example.com/")).toBe("https://gateway.example.com");
    expect(() => normalizeGatewayOrigin("ftp://gateway.example.com")).toThrow();
    expect(() => normalizeGatewayOrigin("https://gateway.example.com/v1")).toThrow();
  });

  it("discovers exactly one public model without credentials", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toBeUndefined();
      return Response.json({ object: "list", data: [model] });
    });
    const client = new GatewayClient("https://gateway.example.com/", { fetch: fetcher });
    await expect(client.discoverModel()).resolves.toEqual(model);
    expect(fetcher).toHaveBeenCalledWith("https://gateway.example.com/v1/models", expect.objectContaining({ method: "GET" }));
  });

  it.each([
    { data: [] },
    { data: [model, { ...model, id: "second" }] },
    { data: [{ nope: true }] },
  ])(
    "rejects invalid model cardinality or shape",
    async ({ data }) => {
      const client = new GatewayClient("https://gateway.example.com", {
        fetch: async () => Response.json({ object: "list", data }),
      });
      await expect(client.discoverModel()).rejects.toMatchObject({ code: "invalid_response" });
    },
  );

  it("returns a validated non-streaming completion", async () => {
    const client = new GatewayClient("https://gateway.example.com", {
      fetch: async (_input, init) => {
        expect(init?.body).toContain('"stream":false');
        return Response.json({
          id: "chatcmpl-1", object: "chat.completion", created: 1, model: model.id,
          choices: [{ index: 0, message: { role: "assistant", content: "سلام" }, finish_reason: "stop" }],
        });
      },
    });
    const result = await client.complete({ model: model.id, messages: [{ role: "user", content: "سلام" }] });
    expect(result.choices[0]?.message.content).toBe("سلام");
  });

  it("maps a safe OpenAI error and retains the exposed request id", async () => {
    const client = new GatewayClient("https://gateway.example.com", {
      fetch: async () => Response.json(
        { error: { message: "درخواست محدود شد", type: "rate_limit_error", param: null, code: "rate_limit_exceeded" } },
        { status: 429, headers: { "x-request-id": "13df274a-2e13-421d-8ec7-e77a528aaa6b" } },
      ),
    });
    const error = await client.discoverModel().catch((cause) => cause);
    expect(error).toBeInstanceOf(GatewayClientError);
    expect(error).toMatchObject({ status: 429, code: "rate_limit_exceeded", requestId: "13df274a-2e13-421d-8ec7-e77a528aaa6b" });
  });

  it("never exposes a malformed error body", async () => {
    const client = new GatewayClient("https://gateway.example.com", {
      fetch: async () => new Response("provider=https://secret.example model=private", { status: 502 }),
    });
    await expect(client.discoverModel()).rejects.toMatchObject({ message: "پاسخ امن و معتبری از درگاه دریافت نشد.", code: "invalid_response" });
  });

  it("adds Authorization only when an explicit placeholder is configured", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer anonymous-placeholder");
      return Response.json({ object: "list", data: [model] });
    });
    await new GatewayClient("https://gateway.example.com", { fetch: fetcher, authorizationPlaceholder: "anonymous-placeholder" }).discoverModel();
  });
});
