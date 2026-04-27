import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createDeterministicRng, nextBackoffMs } from "./backoff.js";

describe("nextBackoffMs", () => {
  it("returns the base delay for attempt 1 when jitter is neutral", () => {
    assert.equal(nextBackoffMs(1, () => 0.5), 1000);
  });

  it("applies minimum jitter for attempt 2", () => {
    assert.equal(nextBackoffMs(2, () => 0), 1600);
  });

  it("applies maximum jitter for attempt 3", () => {
    assert.equal(nextBackoffMs(3, () => 1), 4800);
  });

  it("caps the base delay at 16 seconds", () => {
    assert.equal(nextBackoffMs(20, () => 0.5), 16000);
  });

  it("produces reproducible sequences with the same seeded RNG", () => {
    const first = createDeterministicRng(42);
    const second = createDeterministicRng(42);

    assert.deepEqual(
      [nextBackoffMs(1, first), nextBackoffMs(2, first), nextBackoffMs(3, first)],
      [nextBackoffMs(1, second), nextBackoffMs(2, second), nextBackoffMs(3, second)]
    );
  });

  it("never returns a negative delay", () => {
    assert.equal(nextBackoffMs(1, () => 0) >= 0, true);
  });
});
