import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const prohibited = [
  "seed-secret-AI_GATEWAY_API_KEY",
  "seed-private-provider-model",
  "seed user message body",
  "seed retrieved passage body",
  "203.0.113.77",
];

describe("tracked and public artifact redaction", () => {
  it("contains none of the seeded prohibited values outside their security tests", () => {
    const inspected: string[] = [];
    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (
          entry.isDirectory() &&
          [
            ".git",
            ".venv",
            "node_modules",
            ".artifacts",
            "dist",
            ".next",
          ].includes(entry.name)
        )
          continue;
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(target);
        else if (
          entry.isFile() &&
          !target.endsWith("test_grounding_redaction.py") &&
          !target.endsWith("secret-artifact-scan.test.ts")
        )
          inspected.push(target);
      }
    };
    walk(root);
    const leaks: string[] = [];
    for (const file of inspected) {
      const value = fs.readFileSync(file);
      if (value.includes(0)) continue;
      const text = value.toString("utf8");
      for (const canary of prohibited)
        if (text.includes(canary)) leaks.push(`${file}:${canary}`);
    }
    expect(leaks).toEqual([]);
  });
});
