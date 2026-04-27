import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSseStream } from "./sse-parser.js";

const encoder = new TextEncoder();

describe("parseSseStream", () => {
  it("yields data events and then the DONE sentinel", async () => {
    const events = await collect(
      streamFromStrings(["data: a\n\ndata: b\n\ndata: [DONE]\n\n"])
    );

    assert.deepEqual(events, [{ data: "a" }, { data: "b" }, { data: "[DONE]" }]);
  });

  it("drains a final pre-DONE event from a single chunk", async () => {
    const events = await collect(
      streamFromStrings(["data: A\n\ndata: B\n\ndata: [DONE]\n\n"])
    );

    assert.deepEqual(events, [{ data: "A" }, { data: "B" }, { data: "[DONE]" }]);
  });

  it("joins multi-line data payloads with newlines", async () => {
    const events = await collect(streamFromStrings(["data: line1\ndata: line2\n\n"]));

    assert.deepEqual(events, [{ data: "line1\nline2" }]);
  });

  it("ignores comment-only heartbeat events", async () => {
    const events = await collect(streamFromStrings([": heartbeat\n\ndata: ok\n\n"]));

    assert.deepEqual(events, [{ data: "ok" }]);
  });

  it("skips empty events", async () => {
    const events = await collect(streamFromStrings(["\n\ndata: ok\n\n"]));

    assert.deepEqual(events, [{ data: "ok" }]);
  });

  it("releases the reader lock when the consumer breaks early", async () => {
    const body = streamFromStrings(["data: first\n\ndata: second\n\n"]);

    for await (const event of parseSseStream(body)) {
      assert.deepEqual(event, { data: "first" });
      break;
    }

    assert.equal(body.locked, false);
  });

  it("returns cleanly when the stream ends without DONE", async () => {
    const events = await collect(streamFromStrings(["data: only\n\n"]));

    assert.deepEqual(events, [{ data: "only" }]);
  });

  it("parses events split across arbitrary byte offsets", async () => {
    const bytes = encoder.encode("data: split\n\ndata: [DONE]\n\n");
    const events = await collect(
      streamFromBytes([bytes.slice(0, 7), bytes.slice(7, 14), bytes.slice(14)])
    );

    assert.deepEqual(events, [{ data: "split" }, { data: "[DONE]" }]);
  });
});

async function collect(body: ReadableStream<Uint8Array>): Promise<Array<{ readonly data: string }>> {
  const events: Array<{ readonly data: string }> = [];
  for await (const event of parseSseStream(body)) {
    events.push(event);
  }
  return events;
}

function streamFromStrings(chunks: readonly string[]): ReadableStream<Uint8Array> {
  return streamFromBytes(chunks.map((chunk) => encoder.encode(chunk)));
}

function streamFromBytes(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    }
  });
}
