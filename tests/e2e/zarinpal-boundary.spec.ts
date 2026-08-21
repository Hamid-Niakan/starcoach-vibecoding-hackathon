import { expect, test } from "@playwright/test";

test("ZarinPal renders a deferred assistant without gateway traffic", async ({
  page,
}) => {
  const gatewayRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (
      /\/v1\/(?:models|chat\/completions)(?:\?|$)/.test(url) ||
      /(?:ai-gw|gateway|meilisearch|redis)/i.test(new URL(url).hostname)
    ) {
      gatewayRequests.push(url);
    }
  });

  await page.goto("http://127.0.0.1:3002", { waitUntil: "networkidle" });

  await expect(
    page.getByRole("heading", { name: "داشبورد تحلیل پذیرنده" }),
  ).toBeVisible();
  const deferred = page.getByTestId("zarinpal-assistant-deferred");
  await expect(deferred).toBeVisible();
  await expect(deferred).toContainText("پس از دریافت مجموعه‌داده رسمی");
  await expect(deferred.getByRole("button")).toBeDisabled();
  expect(gatewayRequests).toEqual([]);
});
