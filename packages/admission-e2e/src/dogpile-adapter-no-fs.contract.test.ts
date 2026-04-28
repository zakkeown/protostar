/**
 * Phase 6 Plan 06-08 Task 1 — runtime no-fs contract for dogpile-adapter.
 *
 * Defense in depth on top of `packages/dogpile-adapter/src/no-fs.contract.test.ts`
 * (Plan 06-01 static walker). This file is the *runtime* layer of the Q-09
 * decision: any future transitive dep that introduces a node:fs import in the
 * dogpile-adapter call chain trips THIS test, even if the package-local static
 * walker is bypassed.
 *
 * The walker is rooted at BOTH `packages/dogpile-adapter/src` and
 * `packages/dogpile-types/src`. The `dogpile-adapter`'s own `no-fs.contract.test.ts`
 * is excluded — it intentionally imports `node:fs/promises` to inspect its own
 * sources at test time and is not part of the production call chain.
 *
 * The runtime exercise invokes `runFactoryPile` with a fake `stream` and asserts
 * the call returns `ok=true` end-to-end without throwing — combined with the
 * static walker, this is the runtime defense (PILE-06 / Q-09).
 */

import { strict as assert } from "node:assert";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { planningPilePreset, runFactoryPile } from "@protostar/dogpile-adapter";
import type {
  FactoryPileMission,
  PileRunOutcome,
  ResolvedPileBudget
} from "@protostar/dogpile-adapter";
import type {
  ConfiguredModelProvider,
  DogpileOptions,
  RunAccounting,
  RunEvent,
  RunResult,
  StreamEvent,
  StreamHandle,
  Trace
} from "@protostar/dogpile-types";

import { readAll, walkAllTypeScriptFiles } from "./_helpers/barrel-walker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const adapterSrcRoot = resolve(__dirname, "../../dogpile-adapter/src");
const typesSrcRoot = resolve(__dirname, "../../dogpile-types/src");

// dogpile-adapter ships its OWN static no-fs walker at this path. That walker
// imports node:fs/promises to read its sibling source files; excluding it from
// our walk preserves the contract that production call chains stay fs-free.
const SELF_WALKER_BASENAMES = new Set<string>([
  "no-fs.contract.test.js",
  "no-fs.contract.test.ts"
]);

const FORBIDDEN_FS_IMPORTS: readonly RegExp[] = [
  /from\s+["']node:fs["']/,
  /from\s+["']node:fs\/promises["']/,
  /from\s+["']node:path["']/,
  /from\s+["']fs["']/,
  /from\s+["']fs\/promises["']/,
  /from\s+["']path["']/
];

async function collectFsOffenders(root: string): Promise<readonly string[]> {
  const offenders: string[] = [];
  for await (const file of walkAllTypeScriptFiles(root)) {
    const basename = file.split("/").pop() ?? "";
    if (SELF_WALKER_BASENAMES.has(basename)) continue;
    const contents = await readAll(file);
    const code = contents
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    if (FORBIDDEN_FS_IMPORTS.some((pattern) => pattern.test(code))) {
      offenders.push(file);
    }
  }
  return offenders;
}

// ---------- runtime exercise helpers ----------

const stubProvider = {
  // ConfiguredModelProvider is an opaque structural shape from the SDK; the
  // fake stream replaces every behaviour, so the provider is never invoked.
} as unknown as ConfiguredModelProvider;

const baseBudget: ResolvedPileBudget = {
  maxTokens: 12000,
  timeoutMs: 60000
};

const baseMission: FactoryPileMission = {
  preset: planningPilePreset,
  intent: "dogpile-adapter-no-fs runtime exercise"
};

function makeFinalEvent(): RunEvent {
  return {
    type: "final",
    runId: "run-no-fs",
    at: "2026-04-27T00:00:00.000Z",
    output: "{}",
    transcript: { kind: "trace-transcript", entryCount: 0, lastEntryIndex: null },
    termination: {
      kind: "termination-stop",
      rootCondition: { kind: "convergence" },
      firedCondition: { kind: "convergence" },
      reason: "convergence",
      normalizedReason: "convergence"
    }
  } as unknown as RunEvent;
}

function makeRunResult(events: readonly RunEvent[]): RunResult {
  const trace = {
    schemaVersion: "1.0.0",
    runId: "run-no-fs",
    events
  } as unknown as Trace;
  return {
    output: "{}",
    eventLog: {
      kind: "run-event-log",
      runId: "run-no-fs",
      protocol: { kind: "broadcast", maxRounds: 2 },
      eventTypes: events.map((e) => e.type),
      eventCount: events.length,
      events
    },
    trace,
    transcript: [],
    usage: {} as unknown as RunResult["usage"],
    metadata: {} as unknown as RunResult["metadata"],
    accounting: {} as unknown as RunAccounting,
    cost: {} as unknown as RunResult["cost"]
  } as unknown as RunResult;
}

function makeFakeStream(): (opts: DogpileOptions) => StreamHandle {
  return (_opts: DogpileOptions): StreamHandle => {
    const events: readonly RunEvent[] = [makeFinalEvent()];
    const resultPromise = Promise.resolve(makeRunResult(events));
    resultPromise.catch(() => {});

    async function* iterate(): AsyncGenerator<StreamEvent> {
      for (const ev of events) {
        yield ev as StreamEvent;
      }
    }
    const iterator = iterate();
    return {
      status: "running",
      result: resultPromise,
      [Symbol.asyncIterator]: () => iterator,
      cancel: () => {},
      subscribe: () => ({ unsubscribe: () => {} })
    } as unknown as StreamHandle;
  };
}

// ---------- tests ----------

describe("dogpile-adapter-no-fs (Q-09 runtime defense in depth)", () => {
  it("dogpile-adapter-no-fs static: zero node:fs / node:path imports in adapter src", async () => {
    const offenders = await collectFsOffenders(adapterSrcRoot);
    assert.deepEqual(
      offenders,
      [],
      `node:fs / node:path imports forbidden in @protostar/dogpile-adapter. Offenders:\n${offenders.join("\n")}`
    );
  });

  it("dogpile-adapter-no-fs static: zero node:fs / node:path imports in dogpile-types src", async () => {
    const offenders = await collectFsOffenders(typesSrcRoot);
    assert.deepEqual(
      offenders,
      [],
      `node:fs / node:path imports forbidden in @protostar/dogpile-types. Offenders:\n${offenders.join("\n")}`
    );
  });

  it("dogpile-adapter-no-fs runtime: runFactoryPile completes ok=true with fake stream (no fs touched)", async () => {
    const outcome: PileRunOutcome = await runFactoryPile(
      baseMission,
      {
        provider: stubProvider,
        signal: new AbortController().signal,
        budget: baseBudget
      },
      { stream: makeFakeStream() }
    );
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.stopReason, "convergence");
  });
});
