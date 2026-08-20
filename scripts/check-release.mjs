import { readFile } from "node:fs/promises";

const manifests = [
  "apps/liara-docs/package.json",
  "apps/zarin-dashboard/package.json",
];
const blocked = [];

for (const path of manifests) {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  const version = String(manifest.dependencies?.next ?? "");
  if (/^(?:\^|~)?14(?:\.|$)/.test(version))
    blocked.push(`${manifest.name}: next@${version}`);
}

if (blocked.length) {
  console.error(
    `Release blocked: unsupported Next.js 14 detected\n${blocked.join("\n")}`,
  );
  process.exit(1);
}

console.log("Release framework gate passed");
