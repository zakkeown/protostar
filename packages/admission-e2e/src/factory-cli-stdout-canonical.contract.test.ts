import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sortJsonValue } from "@protostar/artifacts/canonical-json";
import { writeStdoutJson } from "@protostar/factory-cli/io";

describe("factory-cli stdout canonical JSON - Phase 9 Q-12 lock", () => {
  it("round-trips writeStdoutJson output through sortJsonValue byte-identically", () => {
    const fixture = { z: 1, a: { c: 3, b: 2 } };
    const chunk = captureStdout(() => writeStdoutJson(fixture));
    const withoutNewline = chunk.trimEnd();
    const reparsed = JSON.parse(withoutNewline) as unknown;

    assert.equal(JSON.stringify(sortJsonValue(reparsed)), withoutNewline);
    assert.equal(withoutNewline, '{"a":{"b":2,"c":3},"z":1}');
  });

  it("sortJsonValue is idempotent for already-canonical output", () => {
    const fixture = { z: 1, a: { c: 3, b: 2 } };
    const once = sortJsonValue(fixture);
    const twice = sortJsonValue(once);

    assert.equal(JSON.stringify(once), JSON.stringify(twice));
  });
});

function captureStdout(fn: () => void): string {
  const originalWrite = process.stdout.write;
  let chunk = "";
  process.stdout.write = ((value: string | Uint8Array) => {
    chunk += typeof value === "string" ? value : Buffer.from(value).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = originalWrite;
  }
  return chunk;
}
