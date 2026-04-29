import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import type { AdapterContext, AdapterEvent } from "@protostar/execution";

import { createMockCoderAdapter, parseMockCoderMode } from "./coder-adapter.js";

const PRE_IMAGE = "before\n";

describe("createMockCoderAdapter", () => {
  it("defaults to deterministic ttt-success output", async () => {
    const adapter = createMockCoderAdapter({});

    assert.equal(adapter.id, "mock-coder:ttt-success");
    const events = await collectEvents(adapter.execute(toAdapterTask(), createAdapterContext()));
    const final = finalEvent(events);

    assert.equal(events[0]?.kind, "progress");
    assert.equal(final.result.outcome, "change-set");
    if (final.result.outcome !== "change-set") throw new Error("expected change-set");
    assert.deepEqual(entriesOf(final.result.changeSet), [
      {
        path: "src/App.tsx",
        op: "modify",
        diff: "--- a/src/App.tsx\n+++ b/src/App.tsx\n@@ -1 +1 @@\n-before\n+after\n",
        preImageSha256: sha256Hex(new TextEncoder().encode(PRE_IMAGE))
      }
    ]);
    assert.equal(final.result.evidence.model, "mock-llm-adapter/ttt-success");
  });

  it("can return an empty deterministic change-set for smoke plumbing", async () => {
    const adapter = createMockCoderAdapter({ mode: "empty-diff" });
    const final = finalEvent(await collectEvents(adapter.execute(toAdapterTask(), createAdapterContext())));

    assert.equal(final.result.outcome, "change-set");
    if (final.result.outcome !== "change-set") throw new Error("expected change-set");
    assert.deepEqual(entriesOf(final.result.changeSet), []);
  });

  it("maps network-drop to observable adapter-network-refusal evidence", async () => {
    const adapter = createMockCoderAdapter({ mode: "network-drop" });
    const events = await collectEvents(adapter.execute(toAdapterTask(), createAdapterContext()));
    const final = finalEvent(events);

    assert.equal(final.result.outcome, "adapter-failed");
    if (final.result.outcome !== "adapter-failed") throw new Error("expected adapter failure");
    assert.equal(final.result.reason, "lmstudio-unreachable");
    assert.match(JSON.stringify(events), /adapter-network-refusal/);
    assert.equal(final.result.evidence.retries[0]?.errorClass, "adapter-network-refusal");
  });

  it("maps transient-failure to retries-exhausted with deterministic evidence", async () => {
    const adapter = createMockCoderAdapter({ mode: "transient-failure" });
    const final = finalEvent(await collectEvents(adapter.execute(toAdapterTask(), createAdapterContext())));

    assert.equal(final.result.outcome, "adapter-failed");
    if (final.result.outcome !== "adapter-failed") throw new Error("expected adapter failure");
    assert.equal(final.result.reason, "retries-exhausted");
    assert.equal(final.result.evidence.retries[0]?.errorClass, "mock-transient-failure");
  });

  it("makes llm-timeout observable only through the AbortSignal path", async () => {
    const adapter = createMockCoderAdapter({ mode: "llm-timeout" });
    const controller = new AbortController();
    const eventsPromise = collectEvents(adapter.execute(toAdapterTask(), createAdapterContext({ signal: controller.signal })));

    await Promise.resolve();
    controller.abort("timeout");
    const events = await eventsPromise;
    const final = finalEvent(events);

    assert.equal(final.result.outcome, "adapter-failed");
    if (final.result.outcome !== "adapter-failed") throw new Error("expected adapter failure");
    assert.equal(final.result.reason, "timeout");
    assert.match(JSON.stringify(events), /llm-abort-timeout/);
    assert.equal(final.result.evidence.retries[0]?.errorClass, "llm-abort-timeout");
  });

  it("parses the PROTOSTAR_MOCK_LLM_MODE values used by stress runners", () => {
    assert.equal(parseMockCoderMode(undefined), "ttt-success");
    assert.equal(parseMockCoderMode("network-drop"), "network-drop");
    assert.equal(parseMockCoderMode("llm-timeout"), "llm-timeout");
    assert.throws(() => parseMockCoderMode("disk-full"), /Unsupported PROTOSTAR_MOCK_LLM_MODE/);
  });
});

function toAdapterTask() {
  return {
    planTaskId: "task-mock",
    title: "Mock deterministic task",
    targetFiles: ["src/App.tsx"],
    adapterRef: "mock"
  };
}

function createAdapterContext(input: { readonly signal?: AbortSignal } = {}): AdapterContext {
  const preImageBytes = new TextEncoder().encode(PRE_IMAGE);
  return {
    signal: input.signal ?? new AbortController().signal,
    confirmedIntent: {
      goalArchetype: "feature-add",
      acceptanceCriteria: ["Mock output is deterministic."],
      capabilityEnvelope: {}
    },
    resolvedEnvelope: {},
    budget: {
      adapterRetriesPerTask: 1,
      taskWallClockMs: 180_000
    },
    network: { allow: "none" },
    repoReader: {
      async readFile(path: string) {
        assert.equal(path, "src/App.tsx");
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

interface PlanChangeSetEntry {
  readonly path: string;
  readonly op: string;
  readonly diff: string;
  readonly preImageSha256: string;
}

function entriesOf(changeSet: unknown): readonly PlanChangeSetEntry[] {
  return (changeSet as { readonly entries: readonly PlanChangeSetEntry[] }).entries;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
