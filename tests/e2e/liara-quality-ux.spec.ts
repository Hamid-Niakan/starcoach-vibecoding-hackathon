import { expect, test, type Page } from "@playwright/test";

const revision = "a".repeat(64);
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
const chunk = (content: string) => ({
  id: "chatcmpl-quality",
  object: "chat.completion.chunk",
  created: 1,
  model: "liara-assistant",
  choices: [{ index: 0, delta: { content }, finish_reason: null }],
});
const terminal = {
  id: "chatcmpl-quality",
  object: "chat.completion.chunk",
  created: 1,
  model: "liara-assistant",
  choices: [],
  x_liara: {
    schema_version: 1,
    documentation_revision: revision,
    intent: { kind: "direct", missing_fields: [], topic_changed: false },
    answer_path: "generated",
    citations: [
      {
        id: "c1",
        marker: 1,
        passage_id: "passage-123456789",
        title: "Docker",
        heading: "Deploy",
        url: "https://docs.liara.ir/paas/docker/",
        documentation_revision: revision,
        validation: "valid",
      },
    ],
    next_steps: [
      { id: "next", label: "تنظیم دامنه", prompt: "دامنه را چطور تنظیم کنم؟" },
    ],
    reuse: "none",
  },
};
const groundedStream = `data: ${JSON.stringify(chunk("پاسخ [۱]\n\n```bash\nliara deploy\n```\n\n| کلید | مقدار |\n|---|---|\n| PORT | 8080 |"))}\n\ndata: ${JSON.stringify(terminal)}\n\ndata: [DONE]\n\n`;

async function mockModel(page: Page) {
  await page.route("**/v1/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(modelList),
    }),
  );
}

test("keyboard journey renders citations and mixed technical content without page overflow", async ({
  page,
}) => {
  await mockModel(page);
  await page.route("**/v1/chat/completions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "x-request-id": "13df274a-2e13-421d-8ec7-e77a528aaa6b" },
      body: groundedStream,
    }),
  );
  await page.goto("/chat");
  await page.getByRole("button", { name: "استقرار Docker" }).click();
  await expect(page.getByRole("textbox", { name: "پیام" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: /Docker/ })).toHaveAttribute(
    "rel",
    /noopener/,
  );
  await expect(page.locator("pre[dir=ltr]")).toContainText("liara deploy");
  await expect(page.locator(".hackathon-chat__table-scroll")).toBeVisible();
  await page.getByRole("button", { name: /کپی کد bash/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("کپی شد");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("feedback, suggested follow-up, reload, and confirmed new chat remain tab-local", async ({
  page,
}) => {
  await mockModel(page);
  await page.route("**/v1/chat/completions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: groundedStream,
    }),
  );
  await page.goto("/chat");
  await page.getByLabel("پیام").fill("سؤال");
  await page.getByRole("button", { name: "ارسال" }).click();
  await page.getByRole("button", { name: "پاسخ مفید نبود" }).click();
  await page.getByRole("button", { name: "جزئیات کافی نبود" }).click();
  await page.getByRole("button", { name: "تنظیم دامنه" }).click();
  await expect(page.getByLabel("پیام")).toHaveValue("دامنه را چطور تنظیم کنم؟");
  await page.reload();
  await expect(page.getByRole("link", { name: /Docker/ })).toBeVisible();
  await page.getByRole("button", { name: "گفتگوی تازه" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "پاک کردن و شروع" }).click();
  await expect(page.getByText("از کجا شروع کنیم؟")).toBeVisible();
});

test("offline, timeout, and incomplete stream failures stay sanitized and retryable", async ({
  page,
}) => {
  await mockModel(page);
  let attempt = 0;
  await page.route("**/v1/chat/completions", (route) => {
    attempt += 1;
    if (attempt === 1) return route.abort("internetdisconnected");
    if (attempt === 2)
      return route.fulfill({
        status: 504,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            message: "safe",
            type: "gateway_error",
            param: null,
            code: "request_timeout",
          },
        }),
      });
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify(chunk("نیمه"))}\n\n`,
    });
  });
  await page.goto("/chat");
  await page.getByLabel("پیام").fill("سؤال");
  await page.getByRole("button", { name: "ارسال" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "تلاش دوباره" }).click();
  await expect(page.getByRole("alert")).toContainText("زمان پاسخ‌گویی");
  await page.getByRole("button", { name: "تلاش دوباره" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "پاسخ پیش از تکمیل قطع شد",
  );
});

test("interrupted restore and independent tab behavior remain keyboard operable", async ({
  page,
  context,
}) => {
  await mockModel(page);
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
            content: "نیمه",
            status: "streaming",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    ),
  );
  await page.goto("/chat");
  await page.getByRole("button", { name: "تلاش دوباره" }).focus();
  await expect(page.getByRole("button", { name: "تلاش دوباره" })).toBeFocused();
  const independent = await context.newPage();
  await mockModel(independent);
  await independent.goto("/chat");
  await expect(independent.getByText("از کجا شروع کنیم؟")).toBeVisible();
});
