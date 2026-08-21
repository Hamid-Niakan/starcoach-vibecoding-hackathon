import { describe, expect, it } from "vitest";

import { checkIntegrationAncestry } from "../../scripts/check-integration-ancestry.mjs";

const commits = new Set([
  "ea3585676596ecd52b96746c4349ca19c68d0b4d",
  "147887d23f78865fe718971a2bbd9e787bb54e72",
]);

function fixtureGit(args: string[]) {
  if (args[0] === "rev-parse" && args[1]?.endsWith("^{commit}")) {
    return args[1].replace("^{commit}", "");
  }
  if (
    args[0] === "merge-base" &&
    args.at(-1) === "HEAD" &&
    commits.has(args[2] ?? "")
  ) {
    return "";
  }
  if (args[0] === "show-ref") {
    throw new Error("optional ref absent in clean clone fixture");
  }
  throw new Error(`unsupported or failing fixture command: ${args.join(" ")}`);
}

describe("integration provenance", () => {
  it("keeps both pinned source tips as immutable ancestors", () => {
    const output = checkIntegrationAncestry(fixtureGit, "HEAD");
    expect(output).toContain("both pinned source commits");
  });

  it("fails when the selected integration head omits either source", () => {
    expect(() => checkIntegrationAncestry(fixtureGit, "main")).toThrow(
      "not an ancestor",
    );
  });
});
