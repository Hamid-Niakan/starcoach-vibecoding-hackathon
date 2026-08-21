import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sources = [
  {
    label: "monorepo foundation",
    commit: "ea3585676596ecd52b96746c4349ca19c68d0b4d",
    refs: ["refs/heads/codex/monorepo-foundation", "refs/remotes/origin/codex/monorepo-foundation"],
  },
  {
    label: "AI gateway backend",
    commit: "147887d23f78865fe718971a2bbd9e787bb54e72",
    refs: ["refs/heads/feat/ai-gateway-backend", "refs/remotes/origin/feat/ai-gateway-backend"],
  },
];
function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: options.quiet ? "ignore" : ["ignore", "pipe", "pipe"],
  }).trim();
}

export function checkIntegrationAncestry(runGit = git, integrationHead = "HEAD") {
  for (const source of sources) {
    const resolved = runGit(["rev-parse", `${source.commit}^{commit}`]);
    if (resolved !== source.commit) {
      throw new Error(`${source.label} commit does not resolve exactly to ${source.commit}`);
    }

    try {
      runGit(["merge-base", "--is-ancestor", source.commit, integrationHead], { quiet: true });
    } catch {
      throw new Error(`${source.label} (${source.commit}) is not an ancestor of ${integrationHead}`);
    }

    for (const reference of source.refs) {
      try {
        runGit(["show-ref", "--verify", "--quiet", reference], { quiet: true });
      } catch {
        continue;
      }
      const tip = runGit(["rev-parse", reference]);
      if (tip !== source.commit) {
        throw new Error(`${reference} moved from pinned source tip ${source.commit} to ${tip}`);
      }
    }
  }

  return `Integration ancestry OK: both pinned source commits are unchanged ancestors of ${integrationHead}.`;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  console.log(checkIntegrationAncestry(git, process.env.INTEGRATION_HEAD ?? "HEAD"));
}
