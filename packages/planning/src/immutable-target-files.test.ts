import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  IMMUTABLE_TOY_VERIFICATION_PATTERNS,
  validateImmutableTargetFiles
} from "./immutable-target-files.js";

describe("immutable target-file validation", () => {
  it("declares the Phase 11 toy verification files as immutable patterns", () => {
    assert.deepEqual(IMMUTABLE_TOY_VERIFICATION_PATTERNS, [
      "e2e/**",
      "tests/ttt-state.property.test.ts"
    ]);
  });

  it("admits ordinary implementation files", () => {
    const result = validateImmutableTargetFiles({
      targetFiles: ["src/App.tsx", "src/components/Board.tsx"],
      immutableGlobs: IMMUTABLE_TOY_VERIFICATION_PATTERNS
    });

    assert.deepEqual(result, { ok: true, violations: [] });
  });

  it("rejects Playwright and property-test target files with immutable-target-file", () => {
    const result = validateImmutableTargetFiles({
      targetFiles: [
        "e2e/ttt.spec.ts",
        "e2e/helpers/play-game.ts",
        "tests/ttt-state.property.test.ts"
      ],
      immutableGlobs: IMMUTABLE_TOY_VERIFICATION_PATTERNS
    });

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.violations.map(({ code, path }) => ({ code, path })),
      [
        { code: "immutable-target-file", path: "e2e/ttt.spec.ts" },
        { code: "immutable-target-file", path: "e2e/helpers/play-game.ts" },
        { code: "immutable-target-file", path: "tests/ttt-state.property.test.ts" }
      ]
    );
    assert.ok(
      result.violations.every((violation) =>
        violation.message.includes("operator-authored toy verification file")
      )
    );
  });

  it("normalizes backslash paths before enforcing immutable globs", () => {
    const result = validateImmutableTargetFiles({
      targetFiles: ["e2e\\ttt.spec.ts", "tests\\ttt-state.property.test.ts"],
      immutableGlobs: IMMUTABLE_TOY_VERIFICATION_PATTERNS
    });

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.violations.map(({ code, path }) => ({ code, path })),
      [
        { code: "immutable-target-file", path: "e2e/ttt.spec.ts" },
        { code: "immutable-target-file", path: "tests/ttt-state.property.test.ts" }
      ]
    );
  });
});
