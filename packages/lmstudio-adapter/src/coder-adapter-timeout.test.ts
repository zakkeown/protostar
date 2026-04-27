import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import type { AdapterContext, AdapterEvent } from "@protostar/execution";

import { cosmeticTweakFixture } from "../internal/test-fixtures/cosmetic-tweak-fixture.js";
import { createLmstudioCoderAdapter } from "./coder-adapter.js";

const MODEL = "qwen3-coder-next-mlx-4bit";

describe("createLmstudioCoderAdapter abort and timeout behavior", () => {
  it("returns timeout when the task signal aborts mid-stream with reason timeout", async () => {
    const warnings = captureWarnings();
    const controller = new AbortController();
    setTimeout(() => controller.abort("timeout"), 20);
    const adapter = createLmstudioCoderAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      apiKey: "lm-studio",
      fetchImpl: delayedStreamingFetch({ delayMs: 200 })
    });

    try {
      const final = finalEvent(
        await collectEvents(adapter.execute(toAdapterTask(), createContext({ signal: controller.signal })))
      );

      assert.equal(final.result.outcome, "adapter-failed");
      if (final.result.outcome !== "adapter-failed") throw new Error("expected failure");
      assert.equal(final.result.reason, "timeout");
      assert.equal(warnings.maxListenerWarnings.length, 0);
    } finally {
      warnings.dispose();
    }
  });

  it("returns aborted for sigint-style aborts", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort("sigint"), 20);
    const adapter = createLmstudioCoderAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      apiKey: "lm-studio",
      fetchImpl: delayedStreamingFetch({ delayMs: 200 })
    });

    const final = finalEvent(
      await collectEvents(adapter.execute(toAdapterTask(), createContext({ signal: controller.signal })))
    );

    assert.equal(final.result.outcome, "adapter-failed");
    if (final.result.outcome !== "adapter-failed") throw new Error("expected failure");
    assert.equal(final.result.reason, "aborted");
  });

  it("distinguishes timeout from other abort reasons via signal.reason", async () => {
    const timeoutController = new AbortController();
    const cancelController = new AbortController();
    timeoutController.abort("timeout");
    cancelController.abort("operator-cancelled");

    const timeoutFinal = finalEvent(
      await collectEvents(
        createLmstudioCoderAdapter({
          baseUrl: "http://127.0.0.1:1234/v1",
          model: MODEL,
          apiKey: "lm-studio",
          fetchImpl: abortAwareFetch()
        }).execute(toAdapterTask(), createContext({ signal: timeoutController.signal }))
      )
    );
    const cancelFinal = finalEvent(
      await collectEvents(
        createLmstudioCoderAdapter({
          baseUrl: "http://127.0.0.1:1234/v1",
          model: MODEL,
          apiKey: "lm-studio",
          fetchImpl: abortAwareFetch()
        }).execute(toAdapterTask(), createContext({ signal: cancelController.signal }))
      )
    );

    assert.equal(timeoutFinal.result.outcome, "adapter-failed");
    assert.equal(cancelFinal.result.outcome, "adapter-failed");
    if (timeoutFinal.result.outcome !== "adapter-failed") throw new Error("expected failure");
    if (cancelFinal.result.outcome !== "adapter-failed") throw new Error("expected failure");
    assert.equal(timeoutFinal.result.reason, "timeout");
    assert.equal(cancelFinal.result.reason, "aborted");
  });

  it("does not retry timeout aborts", async () => {
    let calls = 0;
    const controller = new AbortController();
    setTimeout(() => controller.abort("timeout"), 20);
    const adapter = createLmstudioCoderAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      apiKey: "lm-studio",
      fetchImpl: async (...args) => {
        calls += 1;
        return delayedStreamingFetch({ delayMs: 200 })(...args);
      },
      sleepMs: async () => {
        throw new Error("timeout must not back off");
      }
    });

    const final = finalEvent(
      await collectEvents(
        adapter.execute(toAdapterTask(), createContext({ signal: controller.signal, adapterRetriesPerTask: 4 }))
      )
    );

    assert.equal(final.result.outcome, "adapter-failed");
    assert.equal(final.result.evidence.attempts, 1);
    assert.equal(final.result.evidence.retries.length, 0);
    assert.equal(calls, 1);
  });

  it("does not leak warning listeners across sequential aborted attempts", async () => {
    const before = process.listenerCount("warning");
    const warnings = captureWarnings();
    try {
      for (let index = 0; index < 5; index += 1) {
        const controller = new AbortController();
        setTimeout(() => controller.abort("timeout"), 5);
        const adapter = createLmstudioCoderAdapter({
          baseUrl: "http://127.0.0.1:1234/v1",
          model: MODEL,
          apiKey: "lm-studio",
          fetchImpl: delayedStreamingFetch({ delayMs: 50 })
        });

        const final = finalEvent(
          await collectEvents(adapter.execute(toAdapterTask(), createContext({ signal: controller.signal })))
        );
        assert.equal(final.result.outcome, "adapter-failed");
      }

      assert.equal(process.listenerCount("warning"), before + 1);
      assert.equal(warnings.maxListenerWarnings.length, 0);
    } finally {
      warnings.dispose();
    }
    assert.equal(process.listenerCount("warning"), before);
  });
});

function delayedStreamingFetch(opts: { readonly delayMs: number }): typeof fetch {
  return async (_input, init) =>
    new Response(abortableDelayedStream(init?.signal, opts.delayMs), {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    });
}

function abortAwareFetch(): typeof fetch {
  return async (_input, init) => {
    if (init?.signal?.aborted) {
      throw new DOMException("The operation was aborted", "AbortError");
    }
    return new Response(sseStream([cosmeticTweakFixture.expectedDiffSample]), { status: 200 });
  };
}

function abortableDelayedStream(
  signal: AbortSignal | null | undefined,
  delayMs: number
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const abort = () => controller.error(new DOMException("The operation was aborted", "AbortError"));
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            choices: [{ index: 0, delta: { content: "```diff\n" }, finish_reason: null }]
          })}\n\n`
        )
      );
      setTimeout(() => {
        if (signal?.aborted) return;
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              choices: [{ index: 0, delta: { content: "--- a/src/Button.tsx\n" }, finish_reason: null }]
            })}\n\n`
          )
        );
      }, delayMs);
    }
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

function captureWarnings(): {
  readonly maxListenerWarnings: Error[];
  dispose(): void;
} {
  const maxListenerWarnings: Error[] = [];
  const onWarning = (warning: Error) => {
    if (warning.name === "MaxListenersExceededWarning") {
      maxListenerWarnings.push(warning);
    }
  };
  process.on("warning", onWarning);
  return {
    maxListenerWarnings,
    dispose() {
      process.off("warning", onWarning);
    }
  };
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
  opts: {
    readonly signal?: AbortSignal;
    readonly adapterRetriesPerTask?: number;
  } = {}
): AdapterContext {
  return {
    signal: opts.signal ?? new AbortController().signal,
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
