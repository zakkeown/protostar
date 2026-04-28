import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDuration } from "./duration.js";

describe("parseDuration", () => {
  it("parses supported duration units into milliseconds", () => {
    assert.deepEqual(parseDuration("24h"), { ok: true, ms: 86_400_000 });
    assert.deepEqual(parseDuration("7d"), { ok: true, ms: 604_800_000 });
    assert.deepEqual(parseDuration("30m"), { ok: true, ms: 1_800_000 });
    assert.deepEqual(parseDuration("10s"), { ok: true, ms: 10_000 });
    assert.deepEqual(parseDuration("2w"), { ok: true, ms: 1_209_600_000 });
  });

  it("rejects malformed duration strings", () => {
    assert.equal(parseDuration("abc").ok, false);
    assert.equal(parseDuration("").ok, false);
    assert.equal(parseDuration("24").ok, false);
    assert.equal(parseDuration("24x").ok, false);
  });
});
