import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const gateway = JSON.parse(read("deploy/liara/gateway.json")) as Record<
  string,
  unknown
>;
const docs = JSON.parse(read("deploy/liara/docs.json")) as Record<
  string,
  unknown
>;

describe("independent Liara deployment definitions", () => {
  it("defines two independent Docker apps and no Compose deployment", () => {
    expect(gateway).toMatchObject({
      kind: "liara-docker-app",
      dockerfile: "deploy/liara/Dockerfile.gateway",
      port: 4000,
      healthCheckPath: "/health/readiness",
    });
    expect(docs).toMatchObject({
      kind: "liara-docker-app",
      dockerfile: "deploy/liara/Dockerfile.docs",
      port: 8080,
      healthCheckPath: "/",
    });
    expect(JSON.stringify([gateway, docs])).not.toMatch(/compose/i);
  });

  it("keeps dependencies private and records names rather than secret values", () => {
    expect(gateway).toMatchObject({
      privateDependencies: ["managed-redis", "meilisearch"],
    });
    const serialized = JSON.stringify(gateway);
    expect(serialized).not.toContain("fixture-secret");
    expect(serialized).not.toContain("sk-");
    expect(serialized).toContain("AI_GATEWAY_API_KEY");
    expect(serialized).toContain("AI_GATEWAY_MEILI_API_KEY");
  });

  it("uses root-context reproducible images with supported health checks", () => {
    const gatewayDockerfile = read("deploy/liara/Dockerfile.gateway");
    const docsDockerfile = read("deploy/liara/Dockerfile.docs");
    expect(gatewayDockerfile).toContain("/health/readiness");
    expect(gatewayDockerfile).toContain("pnpm@10.33.0");
    expect(gatewayDockerfile).toContain("APPROVED_CORPUS_REVISION");
    expect(gateway).toMatchObject({
      buildArgumentNames: ["APPROVED_CORPUS_REVISION"],
    });
    expect(docsDockerfile).toContain("NEXT_PUBLIC_AI_GATEWAY_URL");
    expect(docsDockerfile).toContain("EXPOSE 8080");
  });
});
