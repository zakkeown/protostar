import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import type { AdapterContext, AdapterEvent } from "@protostar/execution";

import { createHostedOpenAiCompatibleCoderAdapter } from "./coder-adapter.js";

const API_KEY_ENV = "PROTOSTAR_HOSTED_LLM_API_KEY";
const FAKE_SECRET = "sk-hosted-test-secret";
const REDACTED = "<redacted:PROTOSTAR_HOSTED_LLM_API_KEY>";
const MODEL = "hosted-coder";
const PRE_IMAGE = "export const color = \"blue\";\n";
const PATCH = [
  "```diff",
  "--- a/src/Button.tsx",
  "+++ b/src/Button.tsx",
  "@@ -1 +1 @@",
  "-export const color = \"blue\";",
  "+export const color = \"green\";",
  "```"
].join("\n");

describe("createHostedOpenAiCompatibleCoderAdapter", () => {
  it("streams tokens and returns a diff change-set without leaking the API key", async () => {
    const seenAuth: string[] = [];
    const adapter = createHostedOpenAiCompatibleCoderAdapter({
      baseUrl: "https://hosted.example/v1",
      model: MODEL,
      env: { [API_KEY_ENV]: FAKE_SECRET },
      fetchImpl: (async (_input, init) => {
        seenAuth.push(new Headers(init?.headers).get("authorization") ?? "");
        return new Response(sseStream([PATCH]), {
          status: 200,
          headers: { "content-type": "text/event-stream" }
        });
      }) as typeof fetch
    });

    assert.equal(adapter.id, "hosted-openai-compatible-coder");
    const events = await collectEvents(adapter.execute(toAdapterTask(), createAdapterContext()));
    const final = finalEvent(events);

    assert.deepEqual(seenAuth, [`Bearer ${FAKE_SECRET}`]);
    assert.equal(final.result.outcome, "change-set");
    if (final.result.outcome !== "change-set") throw new Error("expected change-set");
    assert.equal(entriesOf(final.result.changeSet)[0]?.path, "src/Button.tsx");
    assert.equal(entriesOf(final.result.changeSet)[0]?.preImageSha256, sha256Hex(new TextEncoder().encode(PRE_IMAGE)));
    assert.doesNotMatch(JSON.stringify(events), new RegExp(FAKE_SECRET));
  });

  it("maps HTTP 401 failures to adapter-failed with redacted event payloads", async () => {
    const adapter = createHostedOpenAiCompatibleCoderAdapter({
      baseUrl: "https://hosted.example/v1",
      model: MODEL,
      env: { [API_KEY_ENV]: FAKE_SECRET },
      fetchImpl: (async () => new Response(`denied ${FAKE_SECRET}`, { status: 401 })) as typeof fetch
    });

    const events = await collectEvents(adapter.execute(toAdapterTask(), createAdapterContext()));
    const final = finalEvent(events);
    const payload = JSON.stringify(events);

    assert.equal(final.result.outcome, "adapter-failed");
    if (final.result.outcome !== "adapter-failed") throw new Error("expected adapter failure");
    assert.equal(final.result.reason, "lmstudio-http-error");
    assert.match(payload, new RegExp(REDACTED));
    assert.doesNotMatch(payload, new RegExp(FAKE_SECRET));
  });

  it("maps hosted timeout aborts to typed timeout without leaking the secret", async () => {
    const adapter = createHostedOpenAiCompatibleCoderAdapter({
      baseUrl: "https://hosted.example/v1",
      model: MODEL,
      env: { [API_KEY_ENV]: FAKE_SECRET },
      timeoutMs: 1,
      fetchImpl: timeoutFetch(FAKE_SECRET)
    });

    const events = await collectEvents(adapter.execute(toAdapterTask(), createAdapterContext()));
    const final = finalEvent(events);
    const payload = JSON.stringify(events);

    assert.equal(final.result.outcome, "adapter-failed");
    if (final.result.outcome !== "adapter-failed") throw new Error("expected adapter failure");
    assert.equal(final.result.reason, "timeout");
    assert.match(payload, new RegExp(REDACTED));
    assert.doesNotMatch(payload, new RegExp(FAKE_SECRET));
  });
});

function toAdapterTask() {
  return {
    planTaskId: "task-hosted",
    title: "Update button color",
    targetFiles: ["src/Button.tsx"],
    adapterRef: "hosted-openai-compatible"
  };
}

function createAdapterContext(): AdapterContext {
  const preImageBytes = new TextEncoder().encode(PRE_IMAGE);
  return {
    signal: new AbortController().signal,
    confirmedIntent: {
      goalArchetype: "feature-add",
      acceptanceCriteria: ["Button color changes to green."],
      capabilityEnvelope: {}
    },
    resolvedEnvelope: {},
    budget: {
      adapterRetriesPerTask: 1,
      taskWallClockMs: 180_000
    },
    network: { allow: "allowlist", allowedHosts: ["hosted.example"] },
    repoReader: {
      async readFile(path: string) {
        assert.equal(path, "src/Button.tsx");
        return { bytes: preImageBytes, sha256: sha256Hex(preImageBytes) };
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
  } as unknown as AdapterContext;
}

function timeoutFetch(secret: string): typeof fetch {
  return ((_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException(`timeout while using ${secret}`, "AbortError")),
        { once: true }
      );
    })) as typeof fetch;
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

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

interface PlanChangeSetEntry {
  readonly path: string;
  readonly op: string;
  readonly diff: string;
  readonly preImageSha256: string;
}

function entriesOf(changeSet: unknown): readonly PlanChangeSetEntry[] {
  return (changeSet as { readonly entries: readonly PlanChangeSetEntry[] }).entries;
}
