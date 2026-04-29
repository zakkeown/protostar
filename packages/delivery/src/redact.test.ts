import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { TOKEN_PATTERNS, redactTokens } from "./redact.js";

describe("redactTokens", () => {
  it("redacts a GitHub classic PAT (ghp_)", () => {
    const input = "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    assert.equal(redactTokens(input), "***");
  });

  it("redacts a Bearer header (case-insensitive)", () => {
    assert.equal(redactTokens("Bearer abc123def456ghi789jkl0"), "***");
    assert.equal(redactTokens("bearer abc123def456ghi789jkl0"), "***");
  });

  it("redacts a JWT (three dotted base64url segments)", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    assert.equal(redactTokens(jwt), "***");
  });

  it("leaves short ghp_ prefix unchanged (below length threshold)", () => {
    assert.equal(redactTokens("ghp_short"), "ghp_short");
  });

  it("leaves a normal sentence with no token unchanged", () => {
    assert.equal(redactTokens("normal sentence with no token"), "normal sentence with no token");
  });

  it("exposes TOKEN_PATTERNS as a frozen readonly RegExp array", () => {
    assert.ok(Array.isArray(TOKEN_PATTERNS));
    assert.ok(Object.isFrozen(TOKEN_PATTERNS));
    for (const pattern of TOKEN_PATTERNS) {
      assert.ok(pattern instanceof RegExp);
    }
  });
});
