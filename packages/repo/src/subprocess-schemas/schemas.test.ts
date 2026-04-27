import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyOuterPatternGuard } from "../argv-pattern-guard.js";
import {
  GIT_SCHEMA,
  NODE_SCHEMA,
  PNPM_SCHEMA,
  TSC_SCHEMA
} from "./index.js";

describe("subprocess command schemas", () => {
  it("pins the git diagnostic shell-out surface", () => {
    assert.equal(GIT_SCHEMA.command, "git");
    assert.deepEqual(
      requiredMembers(GIT_SCHEMA.allowedSubcommands, ["status", "rev-parse", "log", "checkout", "branch"]),
      []
    );
    assert.ok(GIT_SCHEMA.allowedFlags.clone?.includes("--depth"));
    assert.equal(GIT_SCHEMA.refValuePattern.test("main"), true);
    assert.equal(GIT_SCHEMA.refValuePattern.test("main;rm"), false);
  });

  it("documents that git clone is handled by isomorphic-git in v1", () => {
    // Phase 3 uses isomorphic-git for clone. The subprocess schema exists for
    // bounded diagnostics and niche future shell-outs, not the clone path.
    assert.ok(GIT_SCHEMA.allowedSubcommands.includes("clone"));
  });

  it("allows scoped pnpm package selectors", () => {
    assert.equal(PNPM_SCHEMA.command, "pnpm");
    assert.equal(PNPM_SCHEMA.refValuePattern.test("@scope/pkg"), true);
    assert.deepEqual(
      requiredMembers(PNPM_SCHEMA.allowedSubcommands, ["install", "run", "build", "test", "--filter", "exec"]),
      []
    );
  });

  it("pins node as a script-path command with top-level flags", () => {
    assert.equal(NODE_SCHEMA.command, "node");
    assert.deepEqual(NODE_SCHEMA.allowedSubcommands, []);
    assert.ok(NODE_SCHEMA.allowedFlags[""]?.includes("--test"));
  });

  it("pins tsc as a flag-driven command", () => {
    assert.equal(TSC_SCHEMA.command, "tsc");
    assert.deepEqual(TSC_SCHEMA.allowedSubcommands, []);
    assert.ok(TSC_SCHEMA.allowedFlags[""]?.includes("-b"));
  });

  it("connects schema flags to the outer guard for safe git diagnostics", () => {
    assert.doesNotThrow(() =>
      applyOuterPatternGuard(
        ["--porcelain", "--untracked-files=no"],
        {
          allowedFlagPrefixes: GIT_SCHEMA.allowedFlags.status ?? [],
          refValuePattern: GIT_SCHEMA.refValuePattern
        }
      )
    );
  });
});

function requiredMembers(actual: readonly string[], expected: readonly string[]): string[] {
  return expected.filter((member) => !actual.includes(member));
}
