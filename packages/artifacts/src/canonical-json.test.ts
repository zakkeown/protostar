import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sortJsonValue } from "./canonical-json.js";

describe("sortJsonValue", () => {
  it("sorts object keys recursively while preserving array order", () => {
    assert.deepEqual(sortJsonValue({ b: 2, a: 1 }), { a: 1, b: 2 });
    assert.deepEqual(sortJsonValue([{ b: 2, a: 1 }, { d: 4, c: 3 }]), [
      { a: 1, b: 2 },
      { c: 3, d: 4 }
    ]);
  });

  it("leaves primitive values unchanged", () => {
    assert.equal(sortJsonValue(null), null);
    assert.equal(sortJsonValue(42), 42);
    assert.equal(sortJsonValue("x"), "x");
    assert.equal(sortJsonValue(true), true);
  });

  it("is idempotent for complex nested values", () => {
    const value = {
      z: [{ d: 4, c: 3 }, { b: { y: true, x: null }, a: [3, 2, 1] }],
      a: { c: "see", b: "bee" }
    };
    const sorted = sortJsonValue(value);

    assert.deepEqual(sortJsonValue(sorted), sorted);
  });

  it("produces byte-stable stringify output", () => {
    assert.equal(JSON.stringify(sortJsonValue({ z: 1, a: { c: 3, b: 2 } })), '{"a":{"b":2,"c":3},"z":1}');
  });

  it("matches execution snapshot byte ordering for a round-tripped fixture", () => {
    const snapshotLike = {
      tasks: {
        "b-task": {
          status: "running",
          lastTransitionAt: "2026-04-27T00:00:00.000Z",
          attempt: 1
        },
        "a-task": {
          status: "pending",
          lastTransitionAt: "2026-04-27T00:00:00.000Z",
          attempt: 1
        }
      },
      schemaVersion: "1.0.0",
      runId: "run_1",
      lastEventSeq: 2,
      generatedAt: "2026-04-27T00:00:02.000Z"
    };

    assert.equal(
      JSON.stringify(sortJsonValue(snapshotLike)),
      '{"generatedAt":"2026-04-27T00:00:02.000Z","lastEventSeq":2,"runId":"run_1","schemaVersion":"1.0.0","tasks":{"a-task":{"attempt":1,"lastTransitionAt":"2026-04-27T00:00:00.000Z","status":"pending"},"b-task":{"attempt":1,"lastTransitionAt":"2026-04-27T00:00:00.000Z","status":"running"}}}'
    );
  });
});
