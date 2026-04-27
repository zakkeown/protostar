import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { createDeterministicRng, nextBackoffMs, type AdapterContext, type AdapterEvent } from "@protostar/execution";

import { cosmeticTweakFixture } from "../internal/test-fixtures/cosmetic-tweak-fixture.js";
import { createLmstudioCoderAdapter } from "./coder-adapter.js";

const MODEL = "qwen3-coder-next-mlx-4bit";

describe("createLmstudioCoderAdapter retry behavior", () => {
  it("retries a transient HTTP 503 and succeeds on the second attempt", async () => {
    const adapter = createLmstudioCoderAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      apiKey: "lm-studio",
      fetchImpl: sequenceFetch([statusResponse(503), streamResponse(cosmeticTweakFixture.expectedDiffSample)]),
      sleepMs: async () => undefined
    });

    const final = finalEvent(await collectEvents(adapter.execute(toAdapterTask(), createContext())));

    assert.equal(final.result.outcome, "change-set");
    assert.equal(final.result.evidence.attempts, 2);
    assert.equal(final.result.evidence.retries[0]?.retryReason, "transient");
  });

  it("stops with retries-exhausted after four transient HTTP attempts", async () => {
    const adapter = createLmstudioCoderAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      apiKey: "lm-studio",
      fetchImpl: sequenceFetch([statusResponse(503), statusResponse(503), statusResponse(503), statusResponse(503)]),
      sleepMs: async () => undefined
    });

    const final = finalEvent(
      await collectEvents(adapter.execute(toAdapterTask(), createContext({ adapterRetriesPerTask: 4 })))
    );

    assert.equal(final.result.outcome, "adapter-failed");
    if (final.result.outcome !== "adapter-failed") throw new Error("expected failure");
    assert.equal(final.result.reason, "retries-exhausted");
    assert.equal(final.result.evidence.attempts, 4);
    assert.equal(final.result.evidence.retries.length, 3);
  });

  it("respects the adapterRetriesPerTask envelope cap", async () => {
    const adapter = createLmstudioCoderAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      apiKey: "lm-studio",
      fetchImpl: sequenceFetch([statusResponse(503), statusResponse(503), statusResponse(503)]),
      sleepMs: async () => undefined
    });

    const final = finalEvent(
      await collectEvents(adapter.execute(toAdapterTask(), createContext({ adapterRetriesPerTask: 2 })))
    );

    assert.equal(final.result.outcome, "adapter-failed");
    assert.equal(final.result.evidence.attempts, 2);
    assert.equal(final.result.evidence.retries.length, 1);
  });

  it("does not retry a non-transient 401", async () => {
    const adapter = createLmstudioCoderAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      apiKey: "lm-studio",
      fetchImpl: sequenceFetch([statusResponse(401)]),
      sleepMs: async () => undefined
    });

    const final = finalEvent(await collectEvents(adapter.execute(toAdapterTask(), createContext())));

    assert.equal(final.result.outcome, "adapter-failed");
    if (final.result.outcome !== "adapter-failed") throw new Error("expected failure");
    assert.equal(final.result.reason, "lmstudio-http-error");
    assert.equal(final.result.evidence.attempts, 1);
    assert.equal(final.result.evidence.retries.length, 0);
  });

  it("retries a transient network error and succeeds on the next attempt", async () => {
    const networkError = new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    const adapter = createLmstudioCoderAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      apiKey: "lm-studio",
      fetchImpl: sequenceFetch([networkError, streamResponse(cosmeticTweakFixture.expectedDiffSample)]),
      sleepMs: async () => undefined
    });

    const final = finalEvent(await collectEvents(adapter.execute(toAdapterTask(), createContext())));

    assert.equal(final.result.outcome, "change-set");
    assert.equal(final.result.evidence.attempts, 2);
    assert.equal(final.result.evidence.retries[0]?.retryReason, "transient");
    assert.equal(final.result.evidence.retries[0]?.errorClass, "TypeError");
  });

  it("fails with lmstudio-unreachable for non-transient fetch errors", async () => {
    const adapter = createLmstudioCoderAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      apiKey: "lm-studio",
      fetchImpl: sequenceFetch([new TypeError("bad response shape")]),
      sleepMs: async () => undefined
    });

    const final = finalEvent(await collectEvents(adapter.execute(toAdapterTask(), createContext())));

    assert.equal(final.result.outcome, "adapter-failed");
    if (final.result.outcome !== "adapter-failed") throw new Error("expected failure");
    assert.equal(final.result.reason, "lmstudio-unreachable");
    assert.equal(final.result.evidence.retries.length, 0);
  });

  it("uses deterministic backoff delays from the injected RNG", async () => {
    const actualDelays: number[] = [];
    const seed = 12345;
    const expectedRng = createDeterministicRng(seed);
    const expectedDelays = [nextBackoffMs(1, expectedRng), nextBackoffMs(2, expectedRng)];
    const adapter = createLmstudioCoderAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      apiKey: "lm-studio",
      rng: createDeterministicRng(seed),
      fetchImpl: sequenceFetch([
        statusResponse(503),
        statusResponse(503),
        streamResponse(cosmeticTweakFixture.expectedDiffSample)
      ]),
      sleepMs: async (ms) => {
        actualDelays.push(ms);
      }
    });

    const final = finalEvent(await collectEvents(adapter.execute(toAdapterTask(), createContext())));

    assert.equal(final.result.outcome, "change-set");
    assert.deepEqual(actualDelays, expectedDelays);
  });
});

type FetchStep = Response | Error;

function sequenceFetch(steps: readonly FetchStep[]): typeof fetch {
  let index = 0;
  return async () => {
    const step = steps[Math.min(index, steps.length - 1)]!;
    index += 1;
    if (step instanceof Error) throw step;
    return step;
  };
}

function statusResponse(status: number): Response {
  return new Response("stub status", { status });
}

function streamResponse(content: string): Response {
  return new Response(sseStream([content]), {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  });
}

function sseStream(chunks: readonly string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }]
            })}\n\n`
          )
        );
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
}

function toAdapterTask() {
  return {
    planTaskId: cosmeticTweakFixture.task.id,
    title: cosmeticTweakFixture.task.title,
    targetFiles: cosmeticTweakFixture.task.targetFiles,
    adapterRef: cosmeticTweakFixture.task.adapterRef
  };
}

function createContext(
  opts: { readonly adapterRetriesPerTask?: number } = {}
): AdapterContext {
  return {
    signal: new AbortController().signal,
    confirmedIntent: cosmeticTweakFixture.intent,
    resolvedEnvelope: cosmeticTweakFixture.intent.capabilityEnvelope,
    budget: {
      adapterRetriesPerTask: opts.adapterRetriesPerTask ?? 4,
      taskWallClockMs: 180_000
    },
    network: { allow: "loopback" },
    repoReader: {
      async readFile(path) {
        const bytes = cosmeticTweakFixture.preImageBytes[path];
        if (bytes === undefined) throw new Error(`unexpected read: ${path}`);
        return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
      },
      async glob() {
        return [];
      }
    },
    journal: {
      async appendToken() {
        return undefined;
      }
    }
  };
}

async function collectEvents(events: AsyncIterable<AdapterEvent>): Promise<AdapterEvent[]> {
  const collected: AdapterEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function finalEvent(events: readonly AdapterEvent[]): Extract<AdapterEvent, { kind: "final" }> {
  const finals = events.filter(
    (event): event is Extract<AdapterEvent, { kind: "final" }> => event.kind === "final"
  );
  assert.equal(finals.length, 1);
  return finals[0]!;
}
