import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const zarinFiles = [
  "apps/zarin-dashboard/package.json",
  "apps/zarin-dashboard/next.config.mjs",
  "apps/zarin-dashboard/app/layout.tsx",
  "apps/zarin-dashboard/app/page.tsx",
  "apps/zarin-dashboard/app/globals.css",
  "apps/zarin-dashboard/Dockerfile",
  "deploy/compose.zarin.yaml",
];

describe("ZarinPal product boundary", () => {
  it("contains no chat/gateway dependency, route, style, or public URL configuration", () => {
    const source = zarinFiles
      .map((file) => `${file}\n${readFileSync(resolve(root, file), "utf8")}`)
      .join("\n");

    expect(source).not.toMatch(/@hackathon\/(?:api-client|chat-ui|contracts)/);
    expect(source).not.toMatch(/\/v1\/(?:models|chat\/completions)/);
    expect(source).not.toMatch(/NEXT_PUBLIC_(?:AI_GATEWAY|API)_URL/);
    expect(source).not.toMatch(/chat-ui\/styles\.css|hackathon-chat/);
  });
});
