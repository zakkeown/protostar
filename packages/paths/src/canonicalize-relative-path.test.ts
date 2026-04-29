import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canonicalizeRelativePath } from "./canonicalize-relative-path.js";

describe("canonicalizeRelativePath", () => {
  it("strips a single leading './'", () => {
    assert.equal(canonicalizeRelativePath("./src/file.ts"), "src/file.ts");
  });

  it("returns a clean relative path unchanged", () => {
    assert.equal(canonicalizeRelativePath("src/file.ts"), "src/file.ts");
  });

  it("does not strip a leading 'a/' prefix (diff convention is the caller's job)", () => {
    assert.equal(canonicalizeRelativePath("a/src/file.ts"), "a/src/file.ts");
  });

  it("normalizes '..' segments inside the path", () => {
    assert.equal(canonicalizeRelativePath("src/../file.ts"), "file.ts");
  });

  it("throws on absolute paths", () => {
    assert.throws(
      () => canonicalizeRelativePath("/abs/path"),
      /absolute/
    );
  });

  it("throws on '..'-escaping inputs", () => {
    assert.throws(
      () => canonicalizeRelativePath("../escape"),
      /escapes/
    );
  });
});
