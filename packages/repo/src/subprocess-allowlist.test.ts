import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  intersectAllowlist,
  SUBPROCESS_BASELINE_ALLOWLIST
} from "./subprocess-allowlist.js";

describe("subprocess allowlist", () => {
  it("exposes a frozen baseline for required runtime commands", () => {
    assert.deepEqual(SUBPROCESS_BASELINE_ALLOWLIST, ["git", "pnpm", "node", "tsc"]);
    assert.equal(Object.isFrozen(SUBPROCESS_BASELINE_ALLOWLIST), true);
  });

  it("returns the baseline when policy does not extend it", () => {
    assert.deepEqual(intersectAllowlist(), ["git", "node", "pnpm", "tsc"]);
    assert.deepEqual(intersectAllowlist([]), ["git", "node", "pnpm", "tsc"]);
  });

  it("extends with policy commands without removing baseline commands", () => {
    assert.deepEqual(intersectAllowlist(["cargo"]), ["cargo", "git", "node", "pnpm", "tsc"]);
    assert.deepEqual(intersectAllowlist(["git"]), ["git", "node", "pnpm", "tsc"]);
  });

  it("returns a frozen readonly effective allowlist", () => {
    const effective: readonly string[] = intersectAllowlist(["cargo", "git"]);

    assert.equal(Object.isFrozen(effective), true);
    assert.throws(() => {
      (effective as string[]).push("make");
    }, TypeError);
  });
});
