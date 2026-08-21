import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const TEST_STACK_URLS = Object.freeze({
  gateway: process.env.E2E_GATEWAY_URL ?? "http://127.0.0.1:4000",
  liara: process.env.E2E_LIARA_URL ?? "http://127.0.0.1:3001",
  zarinpal: process.env.E2E_ZARINPAL_URL ?? "http://127.0.0.1:3002",
});

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const composeFile =
  process.env.E2E_COMPOSE_FILE ?? path.join(repositoryRoot, "compose.yaml");
const composeProjectName =
  process.env.E2E_COMPOSE_PROJECT_NAME ?? "hackathon-e2e";
const startupTimeoutMs = Number.parseInt(
  process.env.E2E_STARTUP_TIMEOUT_MS ?? "180000",
  10,
);

function composeArguments(...args: string[]): string[] {
  return [
    "compose",
    "--project-name",
    composeProjectName,
    "--file",
    composeFile,
    ...args,
  ];
}

async function waitForHealthyResponse(url: string): Promise<void> {
  const deadline = Date.now() + startupTimeoutMs;
  let lastFailure = "no response";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });

      if (response.ok || (response.status >= 300 && response.status < 400)) {
        return;
      }

      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}: ${lastFailure}`);
}

async function startTestStack(): Promise<void> {
  const compose = spawn(
    "docker",
    composeArguments(
      "up",
      "--build",
      "--detach",
      "--wait",
      "--wait-timeout",
      String(Math.ceil(startupTimeoutMs / 1_000)),
    ),
    {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit",
    },
  );

  const exitCode = await new Promise<number>((resolve, reject) => {
    compose.once("error", reject);
    compose.once("exit", (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new Error(`docker compose up exited with status ${exitCode}`);
  }

  await Promise.all([
    waitForHealthyResponse(`${TEST_STACK_URLS.gateway}/health/readiness`),
    waitForHealthyResponse(`${TEST_STACK_URLS.liara}/chat`),
    waitForHealthyResponse(TEST_STACK_URLS.zarinpal),
  ]);
}

let teardownStarted = false;

function stopTestStack(): void {
  if (teardownStarted) {
    return;
  }

  teardownStarted = true;
  const result = spawnSync(
    "docker",
    composeArguments("down", "--remove-orphans"),
    {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit",
      timeout: 60_000,
    },
  );

  if (result.error) {
    process.stderr.write(
      `Failed to stop the Playwright stack: ${result.error.message}\n`,
    );
  }
}

async function main(): Promise<void> {
  try {
    await startTestStack();
  } catch (error) {
    stopTestStack();
    throw error;
  }

  process.once("SIGINT", () => {
    stopTestStack();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    stopTestStack();
    process.exit(143);
  });
  process.once("exit", stopTestStack);

  await new Promise(() => undefined);
}

const isEntrypoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isEntrypoint) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Unable to start the Playwright stack: ${message}\n`);
    process.exit(1);
  });
}
