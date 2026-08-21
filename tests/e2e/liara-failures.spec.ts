import { expect, test, type Page } from "@playwright/test";

const publicModel = { id: "liara-assistant", object: "model", created: 0, owned_by: "ai-gateway" };

async function installModels(page: Page, data: unknown) {
  await page.route("**/v1/models", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) }));
}

for (const fixture of [
  { name: "zero", body: { object: "list", data: [] } },
  { name: "multiple", body: { object: "list", data: [publicModel, { ...publicModel, id: "other" }] } },
  { name: "malformed", body: { data: [publicModel] } },
]) test(`${fixture.name} model discovery blocks completion`, async ({ page }) => {
  let completionCalls = 0; await installModels(page, fixture.body);
  await page.route("**/v1/chat/completions", (route) => { completionCalls += 1; return route.abort(); });
  await page.goto("/chat"); await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "ارسال" })).toBeDisabled(); expect(completionCalls).toBe(0);
});

for (const fixture of [
  { status: 400, code: "invalid_request_error", text: "درخواست قابل پردازش نیست" },
  { status: 429, code: "rate_limit_exceeded", text: "سهمیه یا نرخ درخواست" },
  { status: 502, code: "upstream_unavailable", text: "سرویس پاسخ‌گو" },
  { status: 503, code: "gateway_not_ready", text: "درگاه هنوز آماده نیست" },
  { status: 504, code: "request_timeout", text: "زمان پاسخ‌گویی" },
]) test(`sanitizes ${fixture.status} recovery`, async ({ page }) => {
  await installModels(page, { object: "list", data: [publicModel] });
  await page.route("**/v1/chat/completions", (route) => route.fulfill({ status: fixture.status, contentType: "application/json", headers: { "x-request-id": "13df274a-2e13-421d-8ec7-e77a528aaa6b" }, body: JSON.stringify({ error: { message: "safe", type: "gateway_error", param: null, code: fixture.code } }) }));
  await page.goto("/chat"); await page.getByLabel("پیام").fill("سلام"); await page.getByRole("button", { name: "ارسال" }).click();
  await expect(page.getByRole("alert")).toContainText(fixture.text); await expect(page.getByRole("alert")).toContainText("13df274a");
});

test("reports incomplete stream without rendering raw provider data", async ({ page }) => {
  await installModels(page, { object: "list", data: [publicModel] });
  await page.route("**/v1/chat/completions", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify({ id: "chatcmpl-e2e", object: "chat.completion.chunk", created: 1, model: "liara-assistant", choices: [{ index: 0, delta: { content: "private-provider.example" }, finish_reason: null }] })}\n\n` }));
  await page.goto("/chat"); await page.getByLabel("پیام").fill("سلام"); await page.getByRole("button", { name: "ارسال" }).click();
  await expect(page.getByRole("alert")).toContainText("پاسخ پیش از تکمیل قطع شد");
});
