import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatPanel } from "./ChatPanel.js";
import { LIARA_CHAT_STORAGE_KEY } from "./session-storage.js";

const model = { object: "list", data: [{ id: "liara-assistant", object: "model", created: 0, owned_by: "ai-gateway" }] };
const encoder = new TextEncoder();
const frame = (content: string) => `data: ${JSON.stringify({ id: "chatcmpl-1", object: "chat.completion.chunk", created: 1, model: "liara-assistant", choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`;

function streamResponse(parts = [frame("س"), frame("لام"), "data: [DONE]\n\n"], delay = 0) {
  return new Response(new ReadableStream({
    async start(controller) {
      for (const part of parts) { controller.enqueue(encoder.encode(part)); if (delay) await new Promise((resolve) => setTimeout(resolve, delay)); }
      controller.close();
    },
  }), { headers: { "content-type": "text/event-stream", "x-request-id": "13df274a-2e13-421d-8ec7-e77a528aaa6b" } });
}

describe("ChatPanel", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("discovers once, renders increments, and sends follow-up context", async () => {
    const bodies: unknown[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/v1/models")) return Response.json(model);
      bodies.push(JSON.parse(String(init?.body)));
      return streamResponse();
    });
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup(); render(<ChatPanel gatewayUrl="https://gateway.example.com" />);
    await screen.findByText("از کجا شروع کنیم؟");
    await user.type(screen.getByLabelText("پیام"), "سلام"); await user.click(screen.getByRole("button", { name: "ارسال" }));
    await screen.findByText("سلام", { selector: ".hackathon-chat__message--assistant p" });
    await user.type(screen.getByLabelText("پیام"), "ادامه"); await user.click(screen.getByRole("button", { name: "ارسال" }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/v1/models"))).toHaveLength(1);
    expect(bodies[1]).toMatchObject({ messages: [
      { role: "user", content: "سلام" }, { role: "assistant", content: "سلام" }, { role: "user", content: "ادامه" },
    ] });
  });

  it("marks partial output stopped, keeps it in follow-up context, and retries by replacement", async () => {
    const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    let completion = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/v1/models")) return Response.json(model);
      bodies.push(JSON.parse(String(init?.body)));
      completion += 1;
      if (completion === 1) return new Response(new ReadableStream({ start(value) { value.enqueue(encoder.encode(frame("نیمه"))); } }));
      return streamResponse();
    }));
    const user = userEvent.setup(); render(<ChatPanel gatewayUrl="https://gateway.example.com" />);
    await screen.findByText("از کجا شروع کنیم؟");
    await user.type(screen.getByLabelText("پیام"), "سؤال"); await user.click(screen.getByRole("button", { name: "ارسال" }));
    await screen.findByText("نیمه"); await user.click(screen.getByRole("button", { name: "توقف" }));
    await screen.findByText("پاسخ متوقف شد", { selector: "small" });
    expect(screen.getAllByText("نیمه")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    await screen.findByText("سلام", { selector: ".hackathon-chat__message--assistant p" });
    expect(screen.queryByText("نیمه")).not.toBeInTheDocument();
    expect(bodies[1]?.messages).toEqual([{ role: "user", content: "سؤال" }]);
  });

  it("persists same-tab state and restores streaming output as stopped", async () => {
    sessionStorage.setItem(LIARA_CHAT_STORAGE_KEY, JSON.stringify({
      version: 1, model: "liara-assistant", updatedAt: "2026-08-21T10:00:00.000Z", messages: [
        { id: "11111111-1111-4111-8111-111111111111", turnId: "22222222-2222-4222-8222-222222222222", role: "user", content: "سؤال", status: "completed", createdAt: "2026-08-21T10:00:00.000Z" },
        { id: "33333333-3333-4333-8333-333333333333", turnId: "22222222-2222-4222-8222-222222222222", role: "assistant", content: "نیمه", status: "streaming", createdAt: "2026-08-21T10:00:01.000Z" },
      ],
    }));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(model)));
    render(<ChatPanel gatewayUrl="https://gateway.example.com" />);
    await screen.findByText("نیمه"); expect(await screen.findByText("پاسخ متوقف شد")).toBeVisible();
  });

  it.each([
    [400, "invalid_request_error", "درخواست قابل پردازش نیست"],
    [429, "rate_limit_exceeded", "سهمیه یا نرخ درخواست"],
    [503, "gateway_not_ready", "درگاه هنوز آماده نیست"],
    [504, "request_timeout", "زمان پاسخ‌گویی"],
    [502, "upstream_unavailable", "سرویس پاسخ‌گو"],
  ])("shows a safe Persian recovery for HTTP %i", async (status, code, expected) => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/v1/models")
      ? Response.json(model)
      : Response.json({ error: { message: "safe", type: "gateway_error", param: null, code } }, { status, headers: { "x-request-id": "13df274a-2e13-421d-8ec7-e77a528aaa6b" } })));
    const user = userEvent.setup(); render(<ChatPanel gatewayUrl="https://gateway.example.com" />);
    await screen.findByText("از کجا شروع کنیم؟"); await user.type(screen.getByLabelText("پیام"), "سلام"); await user.click(screen.getByRole("button", { name: "ارسال" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(screen.getByRole("alert")).toHaveTextContent("13df274a");
    expect(screen.getByLabelText("پیام")).toHaveFocus();
  });

  it("exposes busy state and a terminal-only live status", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/v1/models") ? Response.json(model) : streamResponse([frame("الف"), frame("ب"), "data: [DONE]\n\n"], 5)));
    const user = userEvent.setup(); render(<ChatPanel gatewayUrl="https://gateway.example.com" />);
    await screen.findByText("از کجا شروع کنیم؟"); await user.type(screen.getByLabelText("پیام"), "سلام"); await user.click(screen.getByRole("button", { name: "ارسال" }));
    expect(screen.getByLabelText("گفتگو")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("در حال دریافت پاسخ");
    await screen.findByText("پاسخ کامل شد");
  });

  it("submits with Enter and preserves Shift+Enter", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/v1/models") ? Response.json(model) : streamResponse()));
    render(<ChatPanel gatewayUrl="https://gateway.example.com" />); const input = await screen.findByLabelText("پیام");
    fireEvent.change(input, { target: { value: "خط اول" } }); fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(input).toHaveValue("خط اول"); fireEvent.keyDown(input, { key: "Enter" }); await screen.findByText("سلام", { selector: ".hackathon-chat__message--assistant p" });
  });
});
