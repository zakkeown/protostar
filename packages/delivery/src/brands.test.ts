import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isValidGitHubTokenFormat,
  validateBranchName,
  validatePrBody,
  validatePrTitle,
  type BranchName
} from "./brands.js";

function assertOk<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false }): T {
  assert.equal(result.ok, true);
  return result.value;
}

function assertRefusalKind(
  result: { readonly ok: true } | { readonly ok: false; readonly refusal: { readonly kind: string } },
  kind: string
): asserts result is { readonly ok: false; readonly refusal: { readonly kind: string } } {
  assert.equal(result.ok, false);
  assert.equal(result.refusal.kind, kind);
}

describe("delivery brand validators", () => {
  it("accepts valid branch names and returns a string brand", () => {
    const value = assertOk(validateBranchName("feature/foo"));
    const asString: string = value;
    const asBrand: BranchName = value;

    assert.equal(asString, "feature/foo");
    assert.equal(asBrand, "feature/foo");
  });

  it("rejects empty, invalid, overlong, and control-character branch names", () => {
    assertRefusalKind(validateBranchName(""), "invalid-branch");
    assertRefusalKind(validateBranchName("with space"), "invalid-branch");
    assertRefusalKind(validateBranchName("a".repeat(245)), "invalid-branch");

    const control = validateBranchName("feature\x07bell");
    assertRefusalKind(control, "control-character");
    assert.deepEqual(control.refusal.evidence, { field: "branch", position: 7, codepoint: 7 });
  });

  it("accepts and truncates PR titles without silently accepting control characters", () => {
    assert.equal(assertOk(validatePrTitle("a".repeat(200))).length, 200);

    const truncated = assertOk(validatePrTitle("a".repeat(250)));
    assert.equal(truncated.length, 198);
    assert.equal(truncated.endsWith("…"), true);

    const control = validatePrTitle("hello\x00world");
    assertRefusalKind(control, "control-character");
    assert.deepEqual(control.refusal.evidence, { field: "title", position: 5, codepoint: 0 });
  });

  it("accepts PR body at the UTF-8 byte limit and refuses oversized or control-character bodies", () => {
    assert.equal(assertOk(validatePrBody("a".repeat(60_000))).length, 60_000);

    const asciiOversized = validatePrBody("a".repeat(60_001));
    assertRefusalKind(asciiOversized, "oversized-body");
    assert.deepEqual(asciiOversized.refusal.evidence, { byteLength: 60_001, limit: 60_000 });

    const emojiOversized = validatePrBody("🚀".repeat(20_000));
    assertRefusalKind(emojiOversized, "oversized-body");
    assert.deepEqual(emojiOversized.refusal.evidence, { byteLength: 80_000, limit: 60_000 });

    const control = validatePrBody("hello\x00");
    assertRefusalKind(control, "control-character");
    assert.deepEqual(control.refusal.evidence, { field: "body", position: 5, codepoint: 0 });
  });

  it("validates classic and fine-grained GitHub token formats", () => {
    assert.equal(isValidGitHubTokenFormat(`ghp_${"a".repeat(36)}`), true);
    assert.equal(isValidGitHubTokenFormat(`github_pat_${"A".repeat(22)}_${"B".repeat(59)}`), true);
    assert.equal(isValidGitHubTokenFormat("not-a-token"), false);
  });
});
