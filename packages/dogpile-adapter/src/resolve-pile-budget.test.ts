import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { resolvePileBudget } from "./resolve-pile-budget.js";

describe("resolvePileBudget — Q-10 envelope clamps preset (per-field min)", () => {
  it("envelope.maxTokens clamps preset.maxTokens (both defined → min)", () => {
    const result = resolvePileBudget(
      { maxTokens: 24000, timeoutMs: 120000 },
      { maxTokens: 12000 }
    );
    assert.equal(result.maxTokens, 12000);
  });

  it("envelope omits maxTokens → preset value passes through (cap not floor)", () => {
    const result = resolvePileBudget(
      { maxTokens: 24000, timeoutMs: 120000 },
      {}
    );
    assert.equal(result.maxTokens, 24000);
  });

  it("preset omits maxTokens, envelope provides → envelope value used", () => {
    const result = resolvePileBudget(
      { timeoutMs: 120000 },
      { maxTokens: 8000 }
    );
    assert.equal(result.maxTokens, 8000);
  });

  it("both omit maxTokens → falls back to Number.MAX_SAFE_INTEGER", () => {
    const result = resolvePileBudget({}, {});
    assert.equal(result.maxTokens, Number.MAX_SAFE_INTEGER);
  });

  it("envelope.timeoutMs clamps preset.timeoutMs", () => {
    const result = resolvePileBudget(
      { maxTokens: 24000, timeoutMs: 120000 },
      { timeoutMs: 60000 }
    );
    assert.equal(result.timeoutMs, 60000);
  });

  it("preset.maxCalls=5, envelope omits maxCalls → resolved.maxCalls === 5", () => {
    const result = resolvePileBudget({ maxCalls: 5 }, {});
    assert.equal(result.maxCalls, 5);
  });

  it("neither defines maxCalls → key absent from resolved", () => {
    const result = resolvePileBudget({}, {});
    assert.equal("maxCalls" in result, false);
  });

  it("preset.maxCalls=10, envelope.maxCalls=3 → envelope clamps to 3", () => {
    const result = resolvePileBudget({ maxCalls: 10 }, { maxCalls: 3 });
    assert.equal(result.maxCalls, 3);
  });
});
