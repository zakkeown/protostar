import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  REQUIRED_TOY_VERIFICATION_FILES,
  assertToyVerificationPreflight
} from "./toy-verification-preflight.js";

describe("toy verification preflight", () => {
  it("returns ok with normalized file paths when both verification files exist", async () => {
    const result = await assertToyVerificationPreflight({
      toyRepoRoot: "../protostar-toy-ttt",
      exists: async () => true
    });

    assert.deepEqual(REQUIRED_TOY_VERIFICATION_FILES, [
      "e2e/ttt.spec.ts",
      "tests/ttt-state.property.test.ts"
    ]);
    assert.deepEqual(result, {
      ok: true,
      files: [
        "../protostar-toy-ttt/e2e/ttt.spec.ts",
        "../protostar-toy-ttt/tests/ttt-state.property.test.ts"
      ]
    });
  });

  it("reports the missing Playwright file", async () => {
    const result = await assertToyVerificationPreflight({
      toyRepoRoot: "../protostar-toy-ttt",
      exists: async (path) => !path.endsWith("/e2e/ttt.spec.ts")
    });

    assert.deepEqual(result, {
      ok: false,
      code: "toy-verification-missing",
      missingFiles: ["../protostar-toy-ttt/e2e/ttt.spec.ts"]
    });
  });

  it("reports the missing property-test file", async () => {
    const result = await assertToyVerificationPreflight({
      toyRepoRoot: "../protostar-toy-ttt",
      exists: async (path) => !path.endsWith("/tests/ttt-state.property.test.ts")
    });

    assert.deepEqual(result, {
      ok: false,
      code: "toy-verification-missing",
      missingFiles: ["../protostar-toy-ttt/tests/ttt-state.property.test.ts"]
    });
  });

  it("reports both missing verification files", async () => {
    const result = await assertToyVerificationPreflight({
      toyRepoRoot: "../protostar-toy-ttt",
      exists: async () => false
    });

    assert.deepEqual(result, {
      ok: false,
      code: "toy-verification-missing",
      missingFiles: [
        "../protostar-toy-ttt/e2e/ttt.spec.ts",
        "../protostar-toy-ttt/tests/ttt-state.property.test.ts"
      ]
    });
  });

  it("normalizes path separators in output and existence checks", async () => {
    const checkedPaths: string[] = [];
    const result = await assertToyVerificationPreflight({
      toyRepoRoot: "..\\protostar-toy-ttt\\",
      exists: async (path) => {
        checkedPaths.push(path);
        return true;
      }
    });

    assert.deepEqual(checkedPaths, [
      "../protostar-toy-ttt/e2e/ttt.spec.ts",
      "../protostar-toy-ttt/tests/ttt-state.property.test.ts"
    ]);
    assert.deepEqual(result, {
      ok: true,
      files: checkedPaths
    });
  });
});
