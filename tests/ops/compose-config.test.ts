import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = path.resolve(import.meta.dirname, "../..");

function composeConfig(file: string): Record<string, any> {
  return parse(readFileSync(path.join(root, file), "utf8")) as Record<
    string,
    any
  >;
}

describe("authoritative gateway Compose definitions", () => {
  it("runs the deterministic root stack with one-shot bootstrap and readiness ordering", () => {
    const config = composeConfig("compose.yaml") as {
      services: Record<string, any>;
    };
    expect(Object.keys(config.services).sort()).toEqual([
      "gateway",
      "gateway-bootstrap",
      "index-bootstrap",
      "liara",
      "meilisearch",
      "mock-upstream",
      "redis",
      "zarinpal",
    ]);
    expect(config.services["gateway-bootstrap"].restart).toBe("no");
    expect(config.services["gateway-bootstrap"].environment).toEqual(
      config.services.gateway.environment,
    );
    expect(config.services["index-bootstrap"].build.dockerfile).toBe(
      "deploy/liara/Dockerfile.index-bootstrap",
    );
    expect(config.services["index-bootstrap"].volumes).toBeUndefined();
    expect(config.services["index-bootstrap"].command.join(" ")).not.toContain(
      "pnpm install",
    );
    const dockerIgnore = readFileSync(path.join(root, ".dockerignore"), "utf8");
    expect(dockerIgnore).toContain(
      "!specs/007-liara-assistant-quality/contracts/**",
    );
    expect(
      config.services.gateway.depends_on["gateway-bootstrap"].condition,
    ).toBe("service_completed_successfully");
    expect(config.services["gateway-bootstrap"].environment).toEqual(
      config.services.gateway.environment,
    );
    expect(config.services.gateway.healthcheck.test.join(" ")).toContain(
      "/health/readiness",
    );
    expect(config.services.liara.depends_on).toBeUndefined();
    expect(config.services.zarinpal.depends_on?.gateway).toBeUndefined();
    expect(config.services.gateway.environment.AI_GATEWAY_API_KEY).toContain(
      "fixture",
    );
    expect(
      config.services.gateway.environment.AI_GATEWAY_IDENTITY_SECRET,
    ).toContain("0123456789abcdef0123456789abcdef");
  });

  it("keeps the production overlay independently deployable and operator-owned", () => {
    const config = composeConfig("deploy/compose.gateway.yaml") as {
      services: Record<string, any>;
    };
    expect(Object.keys(config.services).sort()).toEqual([
      "gateway",
      "gateway-bootstrap",
      "redis",
    ]);
    expect(
      config.services.gateway.depends_on["gateway-bootstrap"].condition,
    ).toBe("service_completed_successfully");
    expect(config.services.gateway.healthcheck.test.join(" ")).toContain(
      "/health/readiness",
    );
    const source = readFileSync(
      path.join(root, "deploy/compose.gateway.yaml"),
      "utf8",
    );
    expect(source).toContain('AI_GATEWAY_API_KEY: "${AI_GATEWAY_API_KEY:?');
    expect(source).toContain(
      'AI_GATEWAY_IDENTITY_SECRET: "${AI_GATEWAY_IDENTITY_SECRET:?',
    );
    expect(source).not.toContain("fixture-secret-not-for-production");
  });
});
