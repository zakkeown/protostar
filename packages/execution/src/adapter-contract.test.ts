import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CapabilityEnvelope, ConfirmedIntent } from "@protostar/intent";

import type {
  AdapterContext,
  AdapterEvent,
  AdapterFailureReason,
  AdapterResult,
  ExecutionAdapter
} from "./adapter-contract.js";

describe("ExecutionAdapter contract", () => {
  it("streams a final change-set event whose changeSet is readable by consumers", async () => {
    const adapter: ExecutionAdapter = {
      id: "test-mock",
      async *execute() {
        yield {
          kind: "final",
          result: {
            outcome: "change-set",
            changeSet: {
              workspace: { root: "/tmp/workspace", trust: "trusted" },
              branch: "main",
              patches: [{ path: "README.md", operation: "modify", summary: "Tweak copy" }]
            },
            evidence: emptyEvidence()
          }
        };
      }
    };

    const events = await collectAdapterEvents(adapter);
    const final = events.find((event): event is Extract<AdapterEvent, { readonly kind: "final" }> => {
      return event.kind === "final";
    });

    assert.equal(final?.result.outcome, "change-set");
    assert.equal(final.result.changeSet.patches[0]?.path, "README.md");
  });

  it("streams tokens before an adapter-failed final event", async () => {
    const adapter: ExecutionAdapter = {
      id: "test-mock",
      async *execute() {
        yield { kind: "token", text: "thinking" };
        yield {
          kind: "final",
          result: {
            outcome: "adapter-failed",
            reason: "parse-no-block",
            evidence: emptyEvidence()
          }
        };
      }
    };

    const events = await collectAdapterEvents(adapter);
    assert.deepEqual(
      events.map((event) => event.kind),
      ["token", "final"]
    );

    const final = events[1];
    assert.equal(final?.kind, "final");
    assert.equal(final.result.outcome, "adapter-failed");
    assert.equal(final.result.reason, "parse-no-block");
  });

  it("keeps AdapterFailureReason exhaustively classified", () => {
    const reasons: readonly AdapterFailureReason[] = [
      "parse-no-block",
      "parse-multiple-blocks",
      "parse-reformat-failed",
      "lmstudio-unreachable",
      "lmstudio-http-error",
      "lmstudio-model-not-loaded",
      "retries-exhausted",
      "aborted",
      "timeout",
      "aux-read-budget-exceeded"
    ];

    assert.deepEqual(reasons.map(classifyFailureReason), reasons);

    // Uncommenting the line below must fail type-checking unless classifyFailureReason is updated.
    // const syntheticReason: AdapterFailureReason = "synthetic-reason";
  });

  it("exposes typed budget and network views before the 1.3.0 schema bump lands", () => {
    const context = buildAdapterContext({
      budget: { taskWallClockMs: 180_000, adapterRetriesPerTask: 4 },
      network: { allow: "allowlist", allowedHosts: ["localhost"] }
    });

    const wallClockBudget: number = context.budget.taskWallClockMs;
    const retryBudget: number = context.budget.adapterRetriesPerTask;
    const networkMode: "none" | "loopback" | "allowlist" = context.network.allow;
    const allowedHosts: readonly string[] | undefined = context.network.allowedHosts;

    assert.equal(wallClockBudget, 180_000);
    assert.equal(retryBudget, 4);
    assert.equal(networkMode, "allowlist");
    assert.deepEqual(allowedHosts, ["localhost"]);
  });
});

async function collectAdapterEvents(adapter: ExecutionAdapter): Promise<readonly AdapterEvent[]> {
  const events: AdapterEvent[] = [];
  for await (const event of adapter.execute(
    {
      planTaskId: "task-1",
      title: "Tweak README",
      targetFiles: ["README.md"]
    },
    buildAdapterContext()
  )) {
    events.push(event);
  }
  return events;
}

function emptyEvidence(): Extract<AdapterResult, { readonly outcome: "change-set" }>["evidence"] {
  return {
    model: "test-model",
    attempts: 1,
    durationMs: 1,
    auxReads: [],
    retries: []
  };
}

function buildAdapterContext(overrides: Partial<Pick<AdapterContext, "budget" | "network">> = {}): AdapterContext {
  return {
    signal: new AbortController().signal,
    confirmedIntent: {} as ConfirmedIntent,
    resolvedEnvelope: {
      repoScopes: [],
      toolPermissions: [],
      budget: {}
    } as CapabilityEnvelope,
    repoReader: {
      async readFile() {
        return { bytes: new Uint8Array(), sha256: "empty" };
      },
      async glob() {
        return [];
      }
    },
    journal: {
      async appendToken() {}
    },
    budget: overrides.budget ?? { taskWallClockMs: 180_000, adapterRetriesPerTask: 4 },
    network: overrides.network ?? { allow: "loopback" }
  };
}

function classifyFailureReason(reason: AdapterFailureReason): string {
  switch (reason) {
    case "parse-no-block":
    case "parse-multiple-blocks":
    case "parse-reformat-failed":
    case "lmstudio-unreachable":
    case "lmstudio-http-error":
    case "lmstudio-model-not-loaded":
    case "retries-exhausted":
    case "aborted":
    case "timeout":
    case "aux-read-budget-exceeded":
      return reason;
    default:
      return assertExhaustive(reason);
  }
}

function assertExhaustive(value: never): never {
  throw new Error(String(value));
}
