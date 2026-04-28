import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ArgvError, parseCliArgs } from "./cli-args.js";

describe("factory CLI argv parser", () => {
  it("defaults trust to untrusted when the flag is absent", () => {
    assert.equal(parseCliArgs(["run", "--draft", "draft.json", "--out", "out"]).trust, "untrusted");
  });

  it("parses --trust trusted", () => {
    assert.equal(parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--trust", "trusted"]).trust, "trusted");
  });

  it("parses --trust=trusted", () => {
    assert.equal(parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--trust=trusted"]).trust, "trusted");
  });

  it("rejects unsupported trust values with ArgvError", () => {
    assert.throws(
      () => parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--trust", "root"]),
      (error: unknown) => error instanceof ArgvError && error.flag === "--trust"
    );
  });

  it("parses --confirmed-intent path", () => {
    assert.equal(
      parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--confirmed-intent", "/tmp/intent.json"])
        .confirmedIntent,
      "/tmp/intent.json"
    );
  });

  it("parses --confirmed-intent=path", () => {
    assert.equal(
      parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--confirmed-intent=/tmp/intent.json"])
        .confirmedIntent,
      "/tmp/intent.json"
    );
  });

  it("rejects --confirmed-intent with no path", () => {
    assert.throws(
      () => parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--confirmed-intent"]),
      (error: unknown) => error instanceof ArgvError && error.flag === "--confirmed-intent"
    );
  });

  // Phase 6 Plan 06-07 Task 1 — pile-mode CLI flags.
  it("parses --planning-mode live", () => {
    assert.equal(
      parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--planning-mode", "live"]).planningMode,
      "live"
    );
  });

  it("parses --planning-mode fixture, --review-mode live, --exec-coord-mode live simultaneously", () => {
    const parsed = parseCliArgs([
      "run",
      "--draft", "d.json",
      "--out", "o",
      "--planning-mode", "fixture",
      "--review-mode", "live",
      "--exec-coord-mode", "live"
    ]);
    assert.equal(parsed.planningMode, "fixture");
    assert.equal(parsed.reviewMode, "live");
    assert.equal(parsed.execCoordMode, "live");
  });

  it("rejects --planning-mode invalid", () => {
    assert.throws(
      () => parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--planning-mode", "auto"]),
      (error: unknown) => error instanceof ArgvError && error.flag === "--planning-mode"
    );
  });
});
