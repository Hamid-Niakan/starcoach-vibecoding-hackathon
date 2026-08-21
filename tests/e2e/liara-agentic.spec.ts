import { expect, test } from "@playwright/test";

const revision = "b".repeat(64);
const model = {
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

test("explicit novice preference is sent as bounded advisory context and workflow requires confirmation", async ({
  page,
}) => {
  const bodies: Array<{ messages: Array<{ role: string; content: string }> }> =
    [];
  await page.route("**/v1/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(model),
    }),
  );
  await page.route("**/v1/chat/completions", (route) => {
    bodies.push(route.request().postDataJSON());
    const content = {
      id: "chatcmpl-agentic",
      object: "chat.completion.chunk",
      created: 1,
      model: "liara-assistant",
      choices: [
        {
          index: 0,
          delta: { content: "مراحل مستند پاسخ" },
          finish_reason: null,
        },
      ],
    };
    const terminal = {
      id: "chatcmpl-agentic",
      object: "chat.completion.chunk",
      created: 1,
      model: "liara-assistant",
      choices: [],
      x_liara: {
        schema_version: 1,
        documentation_revision: revision,
        intent: { kind: "complex", missing_fields: [], topic_changed: false },
        answer_path: "generated",
        citations: [],
        next_steps: [],
        workflow: {
          id: "deploy",
          goal: "استقرار",
          steps: [
            { id: "build", label: "ساخت", status: "current" },
            { id: "verify", label: "بررسی", status: "pending" },
          ],
        },
        reuse: "none",
      },
    };
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify(content)}\n\ndata: ${JSON.stringify(terminal)}\n\ndata: [DONE]\n\n`,
    });
  });
  await page.goto("/chat");
  await page.getByText("تنظیم پاسخ").click();
  await page.getByLabel("سطح تجربه").selectOption("novice");
  await page.getByLabel("پیام").fill("مراحل استقرار چیست؟");
  await page.getByRole("button", { name: "ارسال" }).click();
  await expect(
    page.getByRole("region", { name: "پیشرفت راهنما" }),
  ).toBeVisible();
  expect(bodies[0]?.messages[0]).toMatchObject({ role: "developer" });
  expect(bodies[0]?.messages[0]?.content).toContain("novice");
  await page.getByRole("button", { name: "این مرحله را انجام دادم" }).click();
  await expect(page.getByText("بررسی")).toBeVisible();
});

test("clarification, out-of-scope, and account-action boundaries are represented as safe fixed routes", async ({
  page,
}) => {
  await page.route("**/v1/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(model),
    }),
  );
  await page.goto("/chat");
  await expect(
    page.getByText("دستیار فقط بر پایه مستندات رسمی پاسخ می‌دهد"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "گفتگوی تازه" })).toBeVisible();
});
