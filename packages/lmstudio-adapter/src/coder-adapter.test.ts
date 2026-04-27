import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import type { AdapterContext, AdapterEvent } from "@protostar/execution";

import { cosmeticTweakFixture } from "../internal/test-fixtures/cosmetic-tweak-fixture.js";
import { startStubLmstudio } from "../internal/test-fixtures/stub-lmstudio-server.js";
import { createLmstudioCoderAdapter } from "./coder-adapter.js";

const MODEL = "qwen3-coder-next-mlx-4bit";

describe("createLmstudioCoderAdapter", () => {
  it("streams tokens and returns a change-set with target pre-image hashes", async (t) => {
    const server = await startStubLmstudio({
      chunks: chunkString(cosmeticTweakFixture.expectedDiffSample, 9)
    });
    t.after(() => void server.close());
    const ctx = createAdapterContext();
    const adapter = createLmstudioCoderAdapter({
      baseUrl: server.baseUrl,
      model: MODEL,
      apiKey: "lm-studio"
    });

    assert.equal(adapter.id, "lmstudio-coder");
    const events = await collectEvents(adapter.execute(toAdapterTask(), ctx));
    const tokenText = events
      .filter((event): event is Extract<AdapterEvent, { kind: "token" }> => event.kind === "token")
      .map((event) => event.text)
      .join("");
    const final = finalEvent(events);

    assert.ok(tokenText.length > 0);
    assert.equal(final.result.outcome, "change-set");
    if (final.result.outcome !== "change-set") throw new Error("expected change-set");
    assert.equal(entriesOf(final.result.changeSet)[0]?.path, "src/Button.tsx");
    assert.equal(entriesOf(final.result.changeSet)[0]?.preImageSha256, expectedButtonSha());
  });

  it("performs one parse-reformat retry when the first attempt has prose drift", async () => {
    const responses = [
      cosmeticTweakFixture.proseDriftDiffSample,
      cosmeticTweakFixture.expectedDiffSample
    ];
    const adapter = createLmstudioCoderAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      apiKey: "lm-studio",
      fetchImpl: createStreamingFetch(responses)
    });

    const events = await collectEvents(adapter.execute(toAdapterTask(), createAdapterContext()));
    const final = finalEvent(events);

    assert.equal(final.result.outcome, "change-set");
    assert.equal(final.result.evidence.attempts, 2);
    assert.equal(final.result.evidence.retries[0]?.retryReason, "parse-reformat");
  });

  it("fails when the reformat retry also returns prose-only content", async () => {
    const adapter = createLmstudioCoderAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      apiKey: "lm-studio",
      fetchImpl: createStreamingFetch(["no diff here", "still no diff here"])
    });

    const events = await collectEvents(adapter.execute(toAdapterTask(), createAdapterContext()));
    const final = finalEvent(events);

    assert.equal(final.result.outcome, "adapter-failed");
    if (final.result.outcome !== "adapter-failed") throw new Error("expected failure");
    assert.equal(final.result.reason, "parse-reformat-failed");
  });

  it("rejects multiple diff blocks without retrying", async () => {
    const adapter = createLmstudioCoderAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      apiKey: "lm-studio",
      fetchImpl: createStreamingFetch([
        `${cosmeticTweakFixture.expectedDiffSample}\n\n${cosmeticTweakFixture.expectedDiffSample}`
      ])
    });

    const events = await collectEvents(adapter.execute(toAdapterTask(), createAdapterContext()));
    const final = finalEvent(events);

    assert.equal(final.result.outcome, "adapter-failed");
    if (final.result.outcome !== "adapter-failed") throw new Error("expected failure");
    assert.equal(final.result.reason, "parse-multiple-blocks");
    assert.equal(final.result.evidence.attempts, 1);
    assert.equal(final.result.evidence.retries.length, 0);
  });

  it("appends every token delta to the adapter journal", async () => {
    const chunks = chunkString(cosmeticTweakFixture.expectedDiffSample, 7);
    const journalTokens: string[] = [];
    const adapter = createLmstudioCoderAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      apiKey: "lm-studio",
      fetchImpl: createStreamingFetch([chunks])
    });

    const events = await collectEvents(
      adapter.execute(toAdapterTask(), createAdapterContext({ journalTokens }))
    );
    const tokenText = events
      .filter((event): event is Extract<AdapterEvent, { kind: "token" }> => event.kind === "token")
      .map((event) => event.text)
      .join("");

    assert.equal(tokenText, cosmeticTweakFixture.expectedDiffSample);
    assert.equal(journalTokens.join(""), tokenText);
  });

  it("reads each target file exactly once and pins the Hash 1 of 2 comment", async () => {
    const reads: string[] = [];
    const adapter = createLmstudioCoderAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      apiKey: "lm-studio",
      fetchImpl: createStreamingFetch([cosmeticTweakFixture.expectedDiffSample])
    });

    const events = await collectEvents(
      adapter.execute(toAdapterTask(), createAdapterContext({ reads }))
    );
    const final = finalEvent(events);

    assert.deepEqual(reads, ["src/Button.tsx"]);
    assert.equal(final.result.outcome, "change-set");
    if (final.result.outcome !== "change-set") throw new Error("expected change-set");
    assert.equal(entriesOf(final.result.changeSet)[0]?.preImageSha256, expectedButtonSha());
    assert.match(
      await import("node:fs/promises").then((fs) =>
        fs.readFile(new URL("./coder-adapter.ts", import.meta.url), "utf8")
      ),
      /Hash 1 of 2/
    );
  });
});

function toAdapterTask() {
  return {
    planTaskId: cosmeticTweakFixture.task.id,
    title: cosmeticTweakFixture.task.title,
    targetFiles: cosmeticTweakFixture.task.targetFiles,
    adapterRef: cosmeticTweakFixture.task.adapterRef
  };
}

function createAdapterContext(
  opts: { readonly journalTokens?: string[]; readonly reads?: string[] } = {}
): AdapterContext {
  return {
    signal: new AbortController().signal,
    confirmedIntent: cosmeticTweakFixture.intent,
    resolvedEnvelope: cosmeticTweakFixture.intent.capabilityEnvelope,
    budget: {
      adapterRetriesPerTask: 4,
      taskWallClockMs: 180_000
    },
    network: { allow: "loopback" },
    repoReader: {
      async readFile(path) {
        opts.reads?.push(path);
        const bytes = cosmeticTweakFixture.preImageBytes[path];
        if (bytes === undefined) throw new Error(`unexpected read: ${path}`);
        return { bytes, sha256: sha256Hex(bytes) };
      },
      async glob() {
        return [];
      }
    },
    journal: {
      async appendToken(_taskId, _attempt, text) {
        opts.journalTokens?.push(text);
      }
    }
  };
}

function createStreamingFetch(
  responses: readonly (string | readonly string[])[]
): typeof fetch {
  let index = 0;
  return async () => {
    const response = responses[Math.min(index, responses.length - 1)] ?? "";
    index += 1;
    return new Response(sseStream(Array.isArray(response) ? response : [response]), {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    });
  };
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
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
          })}\n\n`
        )
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
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

function chunkString(value: string, size: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }
  return chunks;
}

function expectedButtonSha(): string {
  return sha256Hex(cosmeticTweakFixture.preImageBytes["src/Button.tsx"]!);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

interface PlanChangeSetEntry {
  readonly path: string;
  readonly op: "modify";
  readonly diff: string;
  readonly preImageSha256: string;
}

function entriesOf(changeSet: unknown): readonly PlanChangeSetEntry[] {
  return (changeSet as { readonly entries: readonly PlanChangeSetEntry[] }).entries;
}
