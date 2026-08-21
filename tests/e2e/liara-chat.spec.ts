import { expect, test, type Page } from "@playwright/test";

const modelList = {
  object: "list",
  data: [
    {
      id: "liara-assistant",
      object: "model",
      created: 0,
      owned_by: "ai-gateway",
    },
  ],
};
const chunk = (content: string) =>
  `data: ${JSON.stringify({ id: "chatcmpl-e2e", object: "chat.completion.chunk", created: 1, model: "liara-assistant", choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`;
const terminal = `data: ${JSON.stringify({ id: "chatcmpl-e2e", object: "chat.completion.chunk", created: 1, model: "liara-assistant", choices: [], x_liara: { schema_version: 1, documentation_revision: "a".repeat(64), intent: { kind: "direct", missing_fields: [], topic_changed: false }, answer_path: "generated", citations: [], next_steps: [], reuse: "none" } })}\n\n`;
const stream = (content: string) =>
  `${chunk(content)}${terminal}data: [DONE]\n\n`;

async function mockGateway(
  page: Page,
  bodies: unknown[],
  content = "پاسخ `pnpm dev` در https://docs.liara.ir",
) {
  await page.route("**/v1/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(modelList),
    }),
  );
  await page.route("**/v1/chat/completions", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: stream(content),
    });
  });
}

test("initial chat, follow-up context, same-tab reload, and LTR islands", async ({
  page,
}) => {
  const bodies: Array<{ messages: unknown[] }> = [];
  await mockGateway(page, bodies);
  await page.goto("/chat");
  await expect(
    page.getByRole("heading", { name: "دستیار مستندات لیارا" }),
  ).toBeVisible();
  await page.getByLabel("پیام").fill("سلام");
  await page.getByRole("button", { name: "ارسال" }).click();
  await expect(
    page.locator(".hackathon-chat__message--assistant"),
  ).toContainText("pnpm dev");
  await page.getByLabel("پیام").fill("ادامه بده");
  await page.getByRole("button", { name: "ارسال" }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]?.messages).toMatchObject([
    { role: "user", content: "سلام" },
    { role: "assistant" },
    { role: "user", content: "ادامه بده" },
  ]);
  await page.reload();
  await expect(page.getByText("ادامه بده")).toBeVisible();
  await expect(page.locator(".hackathon-chat__message code").first()).toHaveCSS(
    "direction",
    "ltr",
  );
  await expect(page.locator(".hackathon-chat__message a").first()).toHaveCSS(
    "direction",
    "ltr",
  );
});

test("restores an interrupted same-tab stream as stopped", async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "hackathon:liara-chat:v1",
      JSON.stringify({
        version: 1,
        model: "liara-assistant",
        updatedAt: new Date().toISOString(),
        messages: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            turnId: "22222222-2222-4222-8222-222222222222",
            role: "user",
            content: "سؤال",
            status: "completed",
            createdAt: new Date().toISOString(),
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            turnId: "22222222-2222-4222-8222-222222222222",
            role: "assistant",
            content: "پاسخ نیمه",
            status: "streaming",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    ),
  );
  await mockGateway(page, []);
  await page.goto("/chat");
  await expect(
    page.getByText("پاسخ متوقف شد", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "تلاش دوباره" })).toBeVisible();
});

test("cancel preserves partial output and retry replaces it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    let count = 0;
    window.fetch = async (input, init) => {
      if (!String(input).endsWith("/v1/chat/completions"))
        return originalFetch(input, init);
      count += 1;
      if (count > 1)
        return new Response(
          `data: ${JSON.stringify({ id: "chatcmpl-e2e", object: "chat.completion.chunk", created: 1, model: "liara-assistant", choices: [{ index: 0, delta: { content: "پاسخ کامل" }, finish_reason: null }] })}\n\n${`data: ${JSON.stringify({ id: "chatcmpl-e2e", object: "chat.completion.chunk", created: 1, model: "liara-assistant", choices: [], x_liara: { schema_version: 1, documentation_revision: "a".repeat(64), intent: { kind: "direct", missing_fields: [], topic_changed: false }, answer_path: "generated", citations: [], next_steps: [], reuse: "none" } })}\n\n`}data: [DONE]\n\n`,
        );
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ id: "chatcmpl-e2e", object: "chat.completion.chunk", created: 1, model: "liara-assistant", choices: [{ index: 0, delta: { content: "پاسخ نیمه" }, finish_reason: null }] })}\n\n`,
              ),
            );
            init?.signal?.addEventListener(
              "abort",
              () => controller.error(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    };
  });
  await page.route("**/v1/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(modelList),
    }),
  );
  await page.goto("/chat");
  await page.getByLabel("پیام").fill("سؤال");
  await page.getByRole("button", { name: "ارسال" }).click();
  await expect(page.getByText("پاسخ نیمه")).toBeVisible();
  await page.getByRole("button", { name: "توقف" }).click();
  await page.getByRole("button", { name: "تلاش دوباره" }).click();
  await expect(page.getByText("پاسخ کامل")).toBeVisible();
  await expect(page.getByText("پاسخ نیمه")).toHaveCount(0);
});

test("an independent page begins empty", async ({ page, context }) => {
  await mockGateway(page, []);
  await page.goto("/chat");
  await page.evaluate(() =>
    sessionStorage.setItem(
      "hackathon:liara-chat:v1",
      JSON.stringify({
        version: 1,
        model: null,
        messages: [],
        updatedAt: new Date().toISOString(),
      }),
    ),
  );
  const independent = await context.newPage();
  await mockGateway(independent, []);
  await independent.goto("/chat");
  await expect(independent.getByText("از کجا شروع کنیم؟")).toBeVisible();
});
