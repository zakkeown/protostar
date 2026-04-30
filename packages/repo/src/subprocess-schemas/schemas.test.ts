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
      requiredMembers(PNPM_SCHEMA.allowedSubcommands, ["-r", "install", "run", "build", "test", "--filter", "exec"]),
      []
    );
  });

  it("admits closed pnpm install and local test bindings", () => {
    const outerGuardSchema = {
      allowedFlagPrefixes: Object.values(PNPM_SCHEMA.allowedFlags).flat(),
      refValuePattern: PNPM_SCHEMA.refValuePattern
    };

    assert.doesNotThrow(() => applyOuterPatternGuard(["install", "--ignore-workspace", "--frozen-lockfile"], outerGuardSchema));
    assert.doesNotThrow(() => validatePnpmArgv(["install", "--ignore-workspace", "--frozen-lockfile"]));
    assert.doesNotThrow(() => validatePnpmArgv(["test"]));
    assert.throws(() => validatePnpmArgv(["-r", "build"]));
  });

  it("accepts only exact curated pnpm add argv shapes", () => {
    assert.deepEqual(
      requiredMembers(PNPM_SCHEMA.allowedSubcommands, ["add"]),
      []
    );

    for (const argv of [
      ["add", "@playwright/test@^1.59.1", "-D"],
      ["add", "fast-check@^4.7.0", "-D"],
      ["add", "clsx@^2.1.1"],
      ["add", "zustand@^5.0.8"],
      ["add", "react-aria-components@^1.13.0"]
    ]) {
      assert.doesNotThrow(() => validatePnpmArgv(argv), `pnpm ${argv.join(" ")} should be accepted.`);
    }
  });

  it("rejects unallowlisted pnpm add argv shapes", () => {
    for (const argv of [
      ["add", "left-pad"],
      ["add", "@playwright/test@latest"],
      ["add", "@playwright/test", "--ignore-scripts"],
      ["add", "fast-check;rm", "-rf", "."],
      ["add", "-g", "fast-check"],
      ["add", "nanoid@^5.0.0"]
    ]) {
      assert.throws(() => validatePnpmArgv(argv), `pnpm ${argv.join(" ")} should be rejected.`);
    }
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

function validatePnpmArgv(argv: readonly string[]): void {
  const validateArgv = (PNPM_SCHEMA as typeof PNPM_SCHEMA & {
    readonly validateArgv?: (argv: readonly string[]) => void;
  }).validateArgv;

  if (validateArgv === undefined) {
    assert.fail("PNPM_SCHEMA.validateArgv must pin exact pnpm add argv.");
  }
  validateArgv(argv);
}
