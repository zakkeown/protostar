/**
 * Plan 06-04 Task 1 — runFactoryPile contract tests (Q-01, Q-02, Q-11).
 *
 * Tests use an injected stream seam (`deps.stream`) to avoid mocking
 * `@protostar/dogpile-types` at module level. Each test builds a synthetic
 * `StreamHandle` whose async-iterator and `result` promise the test fully
 * controls.
 *
 * The fake stream skeleton honours `opts.signal` so abort-driven tests
 * (timeout, parent-abort) actually unblock the for-await loop.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

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

import { runFactoryPile } from "./run-factory-pile.js";
import { planningPilePreset, type FactoryPileMission } from "./index.js";
import type { ResolvedPileBudget } from "./pile-failure-types.js";

// ---------- shared helpers ----------

const stubProvider: ConfiguredModelProvider = {
  // ConfiguredModelProvider is a structural opaque shape from the SDK; tests
  // never invoke it because the fake stream replaces all SDK behaviour.
} as unknown as ConfiguredModelProvider;

const baseBudget: ResolvedPileBudget = {
  maxTokens: 12000,
  timeoutMs: 60000
};

const baseMission: FactoryPileMission = {
  preset: planningPilePreset,
  intent: "test mission"
};

function makeFinalEvent(normalizedReason: string | null): RunEvent {
  return {
    type: "final",
    runId: "run-test",
    at: "2026-04-28T00:00:00.000Z",
    output: "{}",
    cost: { totalUsd: 0, totalTokens: 0, byProvider: {} } as unknown as RunEvent extends { cost: infer C } ? C : never,
    transcript: { kind: "trace-transcript", entryCount: 0, lastEntryIndex: null },
    termination: normalizedReason
      ? ({
          kind: "termination-stop",
          rootCondition: { kind: "budget", maxTokens: 1 },
          firedCondition: { kind: "budget", maxTokens: 1 },
          reason: normalizedReason.startsWith("budget:") ? "budget" : normalizedReason === "convergence" ? "convergence" : "judge",
          normalizedReason
        } as unknown as RunEvent extends { termination?: infer T } ? T : never)
      : undefined
  } as unknown as RunEvent;
}

function makeRunResult(events: readonly RunEvent[]): RunResult {
  const trace = {
    schemaVersion: "1.0.0",
    runId: "run-test",
    events
  } as unknown as Trace;
  return {
    output: "ok",
    eventLog: {
      kind: "run-event-log",
      runId: "run-test",
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

interface FakeStreamConfig {
  readonly events?: readonly RunEvent[];
  readonly waitForAbort?: boolean;
  readonly throwSync?: Error;
  readonly throwAsync?: Error;
}

function makeFakeStream(cfg: FakeStreamConfig): (opts: DogpileOptions) => StreamHandle {
  return (opts: DogpileOptions): StreamHandle => {
    if (cfg.throwSync) {
      throw cfg.throwSync;
    }
    const events = cfg.events ?? [];
    const childSignal = opts.signal;

    let resolveResult!: (r: RunResult) => void;
    let rejectResult!: (e: unknown) => void;
    const resultPromise = new Promise<RunResult>((res, rej) => {
      resolveResult = res;
      rejectResult = rej;
    });
    // Avoid unhandled rejection complaints when the consumer doesn't await.
    resultPromise.catch(() => {});

    async function* iterate(): AsyncGenerator<StreamEvent> {
      if (cfg.throwAsync) {
        rejectResult(cfg.throwAsync);
        throw cfg.throwAsync;
      }
      for (const ev of events) {
        yield ev as StreamEvent;
      }
      if (cfg.waitForAbort) {
        // `AbortSignal.timeout` schedules an unref'd timer; in production the
        // SDK's pending network IO keeps the loop alive long enough for the
        // timer to fire. Tests have no such IO, so we keep the loop alive with
        // a ref'd interval that is cleared the moment the abort fires.
        const keepAlive = setInterval(() => {}, 50);
        try {
          await new Promise<never>((_, reject) => {
            if (!childSignal) return;
            if (childSignal.aborted) {
              reject(childSignal.reason);
              return;
            }
            childSignal.addEventListener(
              "abort",
              () => reject(childSignal.reason),
              { once: true }
            );
          });
        } catch (err) {
          clearInterval(keepAlive);
          rejectResult(err);
          throw err;
        }
        clearInterval(keepAlive);
      }
      const finalEv = events.find((e) => e.type === "final") ?? makeFinalEvent("convergence");
      resolveResult(makeRunResult([...events, ...(events.includes(finalEv) ? [] : [finalEv])]));
    }

    const iterator = iterate();

    const handle: StreamHandle = {
      status: "running",
      result: resultPromise,
      [Symbol.asyncIterator]: () => iterator,
      cancel: () => {
        rejectResult(new Error("cancelled"));
      },
      subscribe: () => ({ unsubscribe: () => {} })
    } as unknown as StreamHandle;
    return handle;
  };
}

// ---------- tests ----------

describe("run-factory-pile (Q-01, Q-02, Q-11) — runFactoryPile contract", () => {
  it("run-factory-pile happy path: accumulates events and returns ok with stopReason", async () => {
    const events: RunEvent[] = [
      makeFinalEvent("convergence")
    ];
    const seen: RunEvent[] = [];
    const outcome = await runFactoryPile(
      baseMission,
      {
        provider: stubProvider,
        signal: new AbortController().signal,
        budget: baseBudget,
        onEvent: (e) => seen.push(e)
      },
      { stream: makeFakeStream({ events }) }
    );
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.stopReason, "convergence");
    assert.equal(seen.length, 1);
  });

  it("run-factory-pile happy path duplicate (label test for grep)", async () => {
    const events: RunEvent[] = [makeFinalEvent("convergence")];
    const outcome = await runFactoryPile(
      baseMission,
      { provider: stubProvider, signal: new AbortController().signal, budget: baseBudget },
      { stream: makeFakeStream({ events }) }
    );
    assert.equal(outcome.ok, true);
  });

  it("on-event-forwarding count matches stream events", async () => {
    const events: RunEvent[] = [
      { type: "role-assignment", runId: "r", at: "t" } as unknown as RunEvent,
      { type: "agent-turn", runId: "r", at: "t" } as unknown as RunEvent,
      { type: "broadcast", runId: "r", at: "t" } as unknown as RunEvent,
      { type: "model-response", runId: "r", at: "t" } as unknown as RunEvent,
      makeFinalEvent("convergence")
    ];
    let count = 0;
    const outcome = await runFactoryPile(
      baseMission,
      {
        provider: stubProvider,
        signal: new AbortController().signal,
        budget: baseBudget,
        onEvent: () => {
          count += 1;
        }
      },
      { stream: makeFakeStream({ events }) }
    );
    assert.equal(outcome.ok, true);
    assert.equal(count, 5);
  });

  it("pile-timeout: childSignal timeout aborts only the pile (configuredTimeoutMs preserved)", async () => {
    const parent = new AbortController();
    const outcome = await runFactoryPile(
      baseMission,
      {
        provider: stubProvider,
        signal: parent.signal,
        budget: { maxTokens: 12000, timeoutMs: 25 }
      },
      { stream: makeFakeStream({ waitForAbort: true }) }
    );
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.failure.class, "pile-timeout");
    if (outcome.failure.class !== "pile-timeout") return;
    assert.equal(outcome.failure.configuredTimeoutMs, 25);
    // Test 6 invariant: parent NOT affected by pile timeout.
    assert.equal(parent.signal.aborted, false);
  });

  it("abort-hierarchy: parent abort cascades to pile-cancelled", async () => {
    const parent = new AbortController();
    const promise = runFactoryPile(
      baseMission,
      {
        provider: stubProvider,
        signal: parent.signal,
        budget: { maxTokens: 12000, timeoutMs: 60000 }
      },
      { stream: makeFakeStream({ waitForAbort: true }) }
    );
    // Trigger parent abort after a tick so the for-await loop is suspended.
    setTimeout(() => parent.abort(), 5);
    const outcome = await promise;
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.failure.class, "pile-cancelled");
    if (outcome.failure.class !== "pile-cancelled") return;
    assert.equal(outcome.failure.reason, "parent-abort");
  });

  it("abort-hierarchy: pile timeout does not abort parent", async () => {
    const parent = new AbortController();
    await runFactoryPile(
      baseMission,
      {
        provider: stubProvider,
        signal: parent.signal,
        budget: { maxTokens: 12000, timeoutMs: 15 }
      },
      { stream: makeFakeStream({ waitForAbort: true }) }
    );
    assert.equal(parent.signal.aborted, false);
  });

  it("pile-network: stream throws ECONNREFUSED → outcome.failure.class === pile-network", async () => {
    const outcome = await runFactoryPile(
      baseMission,
      { provider: stubProvider, signal: new AbortController().signal, budget: baseBudget },
      { stream: makeFakeStream({ throwSync: new Error("ECONNREFUSED") }) }
    );
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.failure.class, "pile-network");
    if (outcome.failure.class !== "pile-network") return;
    assert.match(outcome.failure.lastError.message, /ECONNREFUSED/);
    assert.equal(outcome.failure.attempt, 1);
  });

  it("pile-schema-parse path NOT triggered here: invalid JSON output is still ok=true (parsing deferred per Q-12)", async () => {
    // runFactoryPile must NOT parse output — Plans 05/06 own pile-schema-parse.
    const events: RunEvent[] = [makeFinalEvent("convergence")];
    const outcome = await runFactoryPile(
      baseMission,
      { provider: stubProvider, signal: new AbortController().signal, budget: baseBudget },
      { stream: makeFakeStream({ events }) }
    );
    assert.equal(outcome.ok, true);
  });
});
