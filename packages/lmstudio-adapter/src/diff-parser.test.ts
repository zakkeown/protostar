import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cosmeticTweakFixture } from "../internal/test-fixtures/cosmetic-tweak-fixture.js";
import { parseDiffBlock } from "./diff-parser.js";

describe("parseDiffBlock", () => {
  it("extracts the fixture unified diff from one diff fence", () => {
    const result = parseDiffBlock(cosmeticTweakFixture.expectedDiffSample);

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected diff parse to succeed");
    assert.match(result.diff, /--- a\/src\/Button\.tsx/);
    assert.match(result.diff, /\+\+\+ b\/src\/Button\.tsx/);
  });

  it("rejects a prose preamble before the fenced diff", () => {
    assert.deepEqual(parseDiffBlock(cosmeticTweakFixture.proseDriftDiffSample), {
      ok: false,
      reason: "parse-no-block"
    });
  });

  it("rejects multiple fenced blocks", () => {
    const content = [
      "```diff",
      "--- a/a.ts",
      "+++ b/a.ts",
      "```",
      "```diff",
      "--- a/b.ts",
      "+++ b/b.ts",
      "```"
    ].join("\n");

    assert.deepEqual(parseDiffBlock(content), { ok: false, reason: "parse-multiple-blocks" });
  });

  it("accepts a bare fence", () => {
    const result = parseDiffBlock(["```", "--- a/a.ts", "+++ b/a.ts", "```"].join("\n"));

    assert.deepEqual(result, { ok: true, diff: "--- a/a.ts\n+++ b/a.ts" });
  });

  it("accepts a patch fence", () => {
    const result = parseDiffBlock(["```patch", "--- a/a.ts", "+++ b/a.ts", "```"].join("\n"));

    assert.deepEqual(result, { ok: true, diff: "--- a/a.ts\n+++ b/a.ts" });
  });

  it("returns parse-no-block for empty content", () => {
    assert.deepEqual(parseDiffBlock(""), { ok: false, reason: "parse-no-block" });
  });
});
