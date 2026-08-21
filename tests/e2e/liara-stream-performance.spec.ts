import { expect, test } from "@playwright/test";

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
const metadata = {
  schema_version: 1,
  documentation_revision: "a".repeat(64),
  intent: { kind: "direct", missing_fields: [], topic_changed: false },
  answer_path: "generated",
  citations: [],
  next_steps: [],
  reuse: "none",
};

test("at least 19 of 20 sequential streams show first content within two seconds", async ({
  page,
}) => {
  await page.route("**/v1/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(modelList),
    }),
  );
  let count = 0;
  await page.route("**/v1/chat/completions", (route) => {
    count += 1;
    const body = `data: ${JSON.stringify({ id: `chatcmpl-${count}`, object: "chat.completion.chunk", created: 1, model: "liara-assistant", choices: [{ index: 0, delta: { content: `پاسخ ${count}` }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: `chatcmpl-${count}`, object: "chat.completion.chunk", created: 1, model: "liara-assistant", choices: [], x_liara: metadata })}\n\ndata: [DONE]\n\n`;
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body,
    });
  });
  await page.goto("/chat");
  const timings: number[] = [];
  for (let index = 1; index <= 20; index += 1) {
    const started = performance.now();
    await page.getByLabel("پیام").fill(`پرسش ${index}`);
    await page.getByRole("button", { name: "ارسال" }).click();
    await expect(
      page.getByText(`پاسخ ${index}`, { exact: true }),
    ).toBeVisible();
    timings.push(performance.now() - started);
  }
  expect(
    timings.filter((duration) => duration <= 2_000).length,
    JSON.stringify(timings),
  ).toBeGreaterThanOrEqual(19);
});
