import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertRunIdConfined, parseRunId, type RunId } from "./run-id.js";

describe("run-id", () => {
  it("accepts valid run ids and rejects traversal-shaped or malformed ids", () => {
    const valid = parseRunId("abc-123_XYZ");
    assert.equal(valid.ok, true);

    assert.equal(parseRunId("../etc").ok, false);
    assert.equal(parseRunId("").ok, false);
    assert.equal(parseRunId("a".repeat(129)).ok, false);
    assert.equal(parseRunId("a".repeat(128)).ok, true);
  });

  it("confines parsed run ids to the runs root", () => {
    const parsed = parseRunId("abc");
    assert.equal(parsed.ok, true);

    assert.doesNotThrow(() => assertRunIdConfined("/tmp/runs", parsed.value));
  });

  it("keeps the path confinement guard active even for branded inputs", () => {
    const unsafeRunId = "../outside" as RunId;

    assert.throws(
      () => assertRunIdConfined("/tmp/runs", unsafeRunId),
      /runId \.\.\/outside resolves outside runs root/
    );
  });
});
