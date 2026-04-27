import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyOuterPatternGuard,
  ArgvViolation,
  type OuterGuardSchema
} from "./argv-pattern-guard.js";

const SCHEMA: OuterGuardSchema = Object.freeze({
  allowedFlagPrefixes: Object.freeze(["--depth", "--single-branch"]),
  refValuePattern: /^[a-zA-Z0-9._/-]+$/
});

describe("argv pattern guard", () => {
  it("allows empty argv", () => {
    assert.doesNotThrow(() => applyOuterPatternGuard([], SCHEMA));
  });

  it("allows positional values matching the ref pattern", () => {
    assert.doesNotThrow(() => applyOuterPatternGuard(["feature/branch-1"], SCHEMA));
  });

  it("allows whitelisted bare flags and equals-value forms", () => {
    assert.doesNotThrow(() => applyOuterPatternGuard(["--depth"], SCHEMA));
    assert.doesNotThrow(() => applyOuterPatternGuard(["--depth=1"], SCHEMA));
  });

  it("rejects flags outside the allowed prefixes", () => {
    assertArgvViolation(
      () => applyOuterPatternGuard(["--upload-pack=bad"], SCHEMA),
      "flag-not-allowed"
    );
  });

  it("rejects positional shell metacharacters before ref-pattern validation", () => {
    assertArgvViolation(
      () => applyOuterPatternGuard(["a;b;c"], SCHEMA),
      "shell-metachar"
    );
  });

  it("rejects shell metacharacters in flag values", () => {
    assertArgvViolation(
      () => applyOuterPatternGuard(["--depth=$(rm -rf /)"], SCHEMA),
      "shell-metachar"
    );
  });

  it("treats values after -- as positionals that still match the ref pattern", () => {
    assert.doesNotThrow(() => applyOuterPatternGuard(["--", "main"], SCHEMA));
    assertArgvViolation(
      () => applyOuterPatternGuard(["--", "main;rm"], SCHEMA),
      "shell-metachar"
    );
  });

  it("requires -- before positionals when the schema demands a separator", () => {
    const schemaRequiringSeparator: OuterGuardSchema = Object.freeze({
      ...SCHEMA,
      requireSeparatorBeforePositionals: true
    });

    assertArgvViolation(
      () => applyOuterPatternGuard(["main"], schemaRequiringSeparator),
      "flag-not-allowed"
    );
    assert.doesNotThrow(() => applyOuterPatternGuard(["--", "main"], schemaRequiringSeparator));
  });

  it("rejects whitespace in argv tokens", () => {
    assertArgvViolation(
      () => applyOuterPatternGuard(["a b"], SCHEMA),
      "shell-metachar"
    );
  });
});

function assertArgvViolation(fn: () => void, reason: ArgvViolation["reason"]): void {
  assert.throws(
    fn,
    (error: unknown) =>
      error instanceof ArgvViolation &&
      (error as { readonly reason?: unknown }).reason === reason
  );
}
