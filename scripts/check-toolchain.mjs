import { execFileSync } from "node:child_process";

import packageJson from "../package.json" with { type: "json" };

const expected = {
  nodeMajor: 24,
  pnpm: "10.33.0",
  python: "3.12",
  uv: "0.8.13",
};

function commandVersion(command, args = ["--version"]) {
  try {
    return {
      value: execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      }).trim(),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { error: `Unable to run ${command}: ${detail}` };
  }
}

const failures = [];
const nodeVersion = process.versions.node;
const nodeMajor = Number.parseInt(nodeVersion.split(".")[0] ?? "", 10);
if (nodeMajor !== expected.nodeMajor) {
  failures.push(`Node.js ${expected.nodeMajor}.x required; found ${nodeVersion}`);
}

const declaredPnpm = packageJson.packageManager?.replace(/^pnpm@/, "");
if (declaredPnpm !== expected.pnpm) {
  failures.push(`packageManager must pin pnpm ${expected.pnpm}; found ${declaredPnpm ?? "none"}`);
}

const pnpmResult = commandVersion("pnpm");
const pnpmVersion = pnpmResult.value;
if (pnpmResult.error) {
  failures.push(pnpmResult.error);
} else if (pnpmVersion !== expected.pnpm) {
  failures.push(`pnpm ${expected.pnpm} required; found ${pnpmVersion}`);
}

const pythonResult = commandVersion("python3");
const pythonVersion = pythonResult.value;
if (pythonResult.error) {
  failures.push(pythonResult.error);
} else if (!pythonVersion.startsWith(`Python ${expected.python}.`)) {
  failures.push(`Python ${expected.python}.x required; found ${pythonVersion}`);
}

const uvResult = commandVersion("uv");
const uvVersion = uvResult.value?.replace(/^uv\s+/, "");
if (uvResult.error) {
  failures.push(uvResult.error);
} else if (uvVersion !== expected.uv) {
  failures.push(`uv ${expected.uv} required; found ${uvVersion}`);
}

if (failures.length > 0) {
  console.error("Toolchain check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(
  `Toolchain OK: Node ${nodeVersion}, pnpm ${pnpmVersion}, ${pythonVersion}, uv ${uvVersion}`,
);
