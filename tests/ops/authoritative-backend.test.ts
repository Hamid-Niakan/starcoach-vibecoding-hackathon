import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const excluded = new Set([
  ".git",
  "node_modules",
  ".next",
  ".venv",
  ".turbo",
  ".pytest_cache",
  "dist",
  "specs",
]);

function filesBelow(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (excluded.has(entry)) return [];
    const absolute = path.join(directory, entry);
    return statSync(absolute).isDirectory() ? filesBelow(absolute) : [absolute];
  });
}

describe("authoritative backend guard", () => {
  it("has no active legacy backend workspace or deployment", () => {
    const workspace = readFileSync(
      path.join(root, "pnpm-workspace.yaml"),
      "utf8",
    );
    const rootPackage = readFileSync(path.join(root, "package.json"), "utf8");
    const compose = readFileSync(path.join(root, "compose.yaml"), "utf8");
    expect(() => statSync(path.join(root, "apps/api/package.json"))).toThrow();
    expect(() =>
      statSync(path.join(root, "deploy/compose.api.yaml")),
    ).toThrow();
    expect(workspace).not.toContain("apps/api");
    expect(rootPackage).not.toMatch(/@hackathon\/api|apps\/api/);
    expect(compose).not.toMatch(/postgres|duckdb|apps\/api|api\/health/iu);
  });

  it("documents and executes only the FastAPI gateway backend", () => {
    const activeFiles = filesBelow(root).filter(
      (file) =>
        /(?:README|CONTRIBUTING|compose|package|turbo)/i.test(
          path.basename(file),
        ) || file.startsWith(path.join(root, "docs/architecture")),
    );
    const corpus = activeFiles
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(corpus).not.toMatch(
      /NestJS|nest build|@nestjs|compose\.api|apps\/api/iu,
    );
    expect(corpus).toContain("ai-gw");
    expect(corpus).toContain("/health/readiness");
    expect(corpus).toContain("/v1/chat/completions");
  });
});
