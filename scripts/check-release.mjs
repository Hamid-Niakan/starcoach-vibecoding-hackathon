import { readFile } from "node:fs/promises";

import { evaluateRelease } from "./check-release-lib.mjs";

const manifestPaths = [
  "apps/liara-docs/package.json",
  "apps/zarin-dashboard/package.json",
];
async function optionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}
const manifests = (await Promise.all(manifestPaths.map(optionalJson))).filter(
  Boolean,
);
const corpus = await optionalJson(".artifacts/liara/index/manifest.json");
const criticalReports = await Promise.all(
  [
    ".artifacts/liara/us1/report.json",
    ".artifacts/liara/us3/report.json",
    ".artifacts/liara/us4/report.json",
    ".artifacts/liara/us6/report.json",
  ].map(optionalJson),
);
const deploymentEvidence = await optionalJson(
  ".artifacts/liara/staging/evidence.json",
);
const blocked = evaluateRelease({
  manifests,
  expectedRevision: corpus?.revision ?? "missing",
  criticalReports,
  deploymentEvidence,
});

if (blocked.length) {
  console.error(`Release blocked:\n${blocked.join("\n")}`);
  process.exit(1);
}

console.log("Release gates passed");
