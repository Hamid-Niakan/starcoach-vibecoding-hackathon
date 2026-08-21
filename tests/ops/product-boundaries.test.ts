import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const ignoredDirectories = new Set([".next", ".turbo", "node_modules"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (ignoredDirectories.has(entry)) return [];
    const absolute = resolve(directory, entry);
    return statSync(absolute).isDirectory()
      ? sourceFiles(absolute)
      : [absolute];
  });
}

const zarinRoot = resolve(root, "apps/zarin-dashboard");
const zarinFiles = [
  ...sourceFiles(zarinRoot),
  resolve(root, "deploy/compose.zarin.yaml"),
];

describe("ZarinPal product boundary", () => {
  it("contains no chat/gateway dependency, route, style, or public URL configuration", () => {
    const source = zarinFiles
      .map((file) => `${relative(root, file)}\n${readFileSync(file, "utf8")}`)
      .join("\n");

    expect(source).not.toMatch(/@hackathon\/(?:api-client|chat-ui|contracts)/);
    expect(source).not.toMatch(
      /ai_gateway|grounding\/(?:index|retrieval|orchestrator)/i,
    );
    expect(source).not.toMatch(
      /MEILI(?:SEARCH)?_|LIARA_(?:DOCS|INDEX|GROUNDING)_/,
    );
    expect(source).not.toMatch(/\/v1\/(?:models|chat\/completions)/);
    expect(source).not.toMatch(/NEXT_PUBLIC_(?:AI_GATEWAY|API)_URL/);
    expect(source).not.toMatch(/chat-ui\/styles\.css|hackathon-chat/);
  });

  it("keeps the ZarinPal deployment independent from Liara and gateway services", () => {
    const deployment = readFileSync(
      resolve(root, "deploy/compose.zarin.yaml"),
      "utf8",
    );

    expect(deployment).not.toMatch(
      /ai-gw|gateway|meilisearch|redis|liara-docs/i,
    );
    expect(deployment).not.toMatch(/depends_on|NEXT_PUBLIC_/);
  });
});
