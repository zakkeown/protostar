import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { writeStderr, writeStdoutJson } from "./io.js";

describe("factory-cli io", () => {
  it("writes canonical JSON to stdout with sorted object keys", () => {
    const chunks = captureWrite(process.stdout, () => {
      writeStdoutJson({ b: 2, a: 1 });
    });

    assert.deepEqual(chunks, ['{"a":1,"b":2}\n']);
  });

  it("writes primitive JSON values to stdout", () => {
    const chunks = captureWrite(process.stdout, () => {
      writeStdoutJson(null);
    });

    assert.deepEqual(chunks, ["null\n"]);
  });

  it("sorts object keys inside arrays without reordering the array", () => {
    const chunks = captureWrite(process.stdout, () => {
      writeStdoutJson([{ b: 1, a: 2 }]);
    });

    assert.deepEqual(chunks, ['[{"a":2,"b":1}]\n']);
  });

  it("writes diagnostics to stderr with a newline", () => {
    const chunks = captureWrite(process.stderr, () => {
      writeStderr("hi");
    });

    assert.deepEqual(chunks, ["hi\n"]);
  });
});

function captureWrite(stream: NodeJS.WriteStream, run: () => void): readonly string[] {
  const chunks: string[] = [];
  const originalWrite = stream.write;
  stream.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof stream.write;
  try {
    run();
  } finally {
    stream.write = originalWrite;
  }
  return chunks;
}
