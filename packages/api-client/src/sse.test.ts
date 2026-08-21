import { describe, expect, it, vi } from "vitest";

import { GatewayClientError, parseOpenAIStream, type StreamLimits } from "./index.js";

const chunk = (content: string) => JSON.stringify({
  id: "chatcmpl-1", object: "chat.completion.chunk", created: 1, model: "liara-assistant",
  choices: [{ index: 0, delta: { content }, finish_reason: null }],
});

function response(parts: string[], requestId = "13df274a-2e13-421d-8ec7-e77a528aaa6b") {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) { parts.forEach((part) => controller.enqueue(encoder.encode(part))); controller.close(); },
  }), { headers: { "content-type": "text/event-stream", "x-request-id": requestId } });
}

async function collect(input: Response, limits?: Partial<StreamLimits>, signal?: AbortSignal) {
  const values = [];
  for await (const value of parseOpenAIStream(input, { limits, signal })) values.push(value);
  return values;
}

describe("parseOpenAIStream", () => {
  it("parses split LF/CRLF frames and ignores comments", async () => {
    const values = await collect(response([`: keepalive\r\ndata: ${chunk("س")}`, `\r\n\r\ndata: ${chunk("لام")}\n\n`, "data: [DONE]\n\n"]));
    expect(values.map((value) => value.choices[0]?.delta.content)).toEqual(["س", "لام"]);
  });

  it("cancels the reader at the first DONE and ignores later bytes", async () => {
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    const body = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(`data: ${chunk("ok")}\n\ndata: [DONE]\n\ndata: broken\n\n`)); }, cancel });
    await expect(collect(new Response(body))).resolves.toHaveLength(1);
    expect(cancel).toHaveBeenCalled();
  });

  it("rejects EOF without DONE and retains request id", async () => {
    const error = await collect(response([`data: ${chunk("partial")}\n\n`])).catch((cause) => cause);
    expect(error).toMatchObject({ code: "incomplete_stream", requestId: "13df274a-2e13-421d-8ec7-e77a528aaa6b" });
  });

  it("rejects malformed JSON and malformed chunks", async () => {
    await expect(collect(response(["data: nope\n\ndata: [DONE]\n\n"]))).rejects.toMatchObject({ code: "invalid_stream" });
    await expect(collect(response(["data: {}\n\ndata: [DONE]\n\n"]))).rejects.toMatchObject({ code: "invalid_stream" });
  });

  it.each([
    ["maxEventBytes", { maxEventBytes: 12 }, [`data: ${chunk("x")}\n\n`]],
    ["maxBufferBytes", { maxBufferBytes: 12 }, [`data: ${chunk("x")}`]],
    ["maxStreamBytes", { maxStreamBytes: 12 }, [`data: ${chunk("x")}\n\ndata: [DONE]\n\n`]],
    ["maxEvents", { maxEvents: 0 }, [`data: ${chunk("x")}\n\ndata: [DONE]\n\n`]],
    ["maxTextBytes", { maxTextBytes: 1 }, [`data: ${chunk("xx")}\n\ndata: [DONE]\n\n`]],
  ])("enforces %s", async (_name, limits, parts) => {
    await expect(collect(response(parts as string[]), limits as Partial<StreamLimits>)).rejects.toMatchObject({ code: "stream_limit_exceeded" });
  });

  it("propagates abort and cleans up the reader", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const controller = new AbortController();
    const pending = collect(new Response(body), undefined, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalled();
  });

  it("requires an event-stream response body", async () => {
    await expect(collect(new Response(null))).rejects.toBeInstanceOf(GatewayClientError);
  });
});
