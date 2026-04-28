import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ConfiguredModelProvider } from "@protostar/dogpile-types";
import type {
  FactoryPileMission,
  PileRunContext,
  PileRunOutcome,
  ResolvedPileBudget
} from "@protostar/dogpile-adapter";

import {
  createReviewPileModelReviewer,
  type ReviewPileModelReviewerDeps
} from "./review-pile-reviewer.js";
import type { ModelReviewInput, ModelReviewer } from "./repair-types.js";

// Minimal stubs that satisfy the type system without exercising the full
// admitted-plan / execution-result surface — the reviewer doesn't read those
// fields except to forward them via deps.buildMission / deps.buildContext.
const dummyProvider = { providerId: "stub" } as unknown as ConfiguredModelProvider;
const dummyBudget: ResolvedPileBudget = {
  maxTokens: 1024,
  timeoutMs: 5000
};

function buildInput(): ModelReviewInput {
  return {
    admittedPlan: {
      planId: "plan-1",
      tasks: [{ planTaskId: "t-1" }]
    } as unknown as ModelReviewInput["admittedPlan"],
    executionResult: { runId: "run-1" },
    mechanicalGate: {
      planId: "plan-1",
      runId: "run-1",
      verdict: "pass",
      findings: []
    },
    diff: { nameOnly: [], unifiedDiff: "" }
  };
}

function buildMission(): FactoryPileMission {
  return {
    preset: {
      kind: "review",
      description: "test",
      protocol: { kind: "broadcast", maxRounds: 1 },
      tier: "balanced",
      agents: [{ id: "review-correctness", role: "correctness-reviewer" }],
      budget: { maxTokens: 1024, timeoutMs: 5000 },
      terminate: { kind: "budget", budget: { maxTokens: 1024, timeoutMs: 5000 } } as unknown as FactoryPileMission["preset"]["terminate"]
    },
    intent: "review test"
  };
}

function buildContext(): PileRunContext {
  return {
    provider: dummyProvider,
    signal: new AbortController().signal,
    budget: dummyBudget
  };
}

describe("review-pile-reviewer", () => {
  it("review-pile-reviewer happy path: pass aggregateVerdict yields pass ModelReviewResult with critiques", async () => {
    const body = {
      judgeCritiques: [
        {
          judgeId: "j1",
          model: "qwen-a",
          rubric: { quality: 0.9 },
          verdict: "pass",
          rationale: "looks good",
          taskRefs: ["t-1"]
        },
        {
          judgeId: "j2",
          model: "qwen-b",
          rubric: { quality: 0.85 },
          verdict: "pass",
          rationale: "no issues",
          taskRefs: ["t-1"]
        }
      ],
      aggregateVerdict: "pass"
    };
    const runPile = async (): Promise<PileRunOutcome> => ({
      ok: true,
      result: { output: JSON.stringify(body) } as unknown as PileRunOutcome extends { ok: true; result: infer R } ? R : never,
      trace: { events: [] } as never,
      accounting: {} as never,
      stopReason: null
    });
    const deps: ReviewPileModelReviewerDeps = {
      runPile,
      buildContext,
      buildMission
    };
    const reviewer = createReviewPileModelReviewer(deps);
    const result = await reviewer(buildInput());
    assert.equal(result.verdict, "pass");
    assert.equal(result.critiques.length, 2);
    assert.equal(result.critiques[0]?.judgeId, "j1");
  });

  it("model-reviewer-conformance: returned value satisfies the Phase 5 ModelReviewer interface", async () => {
    const runPile = async (): Promise<PileRunOutcome> => ({
      ok: true,
      result: {
        output: JSON.stringify({
          judgeCritiques: [],
          aggregateVerdict: "pass"
        })
      } as never,
      trace: { events: [] } as never,
      accounting: {} as never,
      stopReason: null
    });
    // Compile-time check: assignment to ModelReviewer must succeed.
    const reviewer: ModelReviewer = createReviewPileModelReviewer({
      runPile,
      buildContext,
      buildMission
    });
    // Runtime: callable with ModelReviewInput, returns ModelReviewResult.
    const result = await reviewer(buildInput());
    assert.equal(typeof result.verdict, "string");
    assert.ok(Array.isArray(result.critiques));
  });

  it("pile failure -> block ModelReviewResult carrying PileFailure as evidence", async () => {
    const runPile = async (): Promise<PileRunOutcome> => ({
      ok: false,
      failure: {
        kind: "review",
        class: "pile-timeout",
        elapsedMs: 130000,
        configuredTimeoutMs: 120000
      }
    });
    const reviewer = createReviewPileModelReviewer({
      runPile,
      buildContext,
      buildMission
    });
    const result = await reviewer(buildInput());
    assert.equal(result.verdict, "block");
    assert.equal(result.critiques.length, 1);
    const evidence = result.critiques[0]?.rationale ?? "";
    assert.ok(evidence.includes("pile-timeout"), `expected pile-timeout in rationale; got ${evidence}`);
  });

  it("parse error -> block ModelReviewResult surfacing parseErrors", async () => {
    const runPile = async (): Promise<PileRunOutcome> => ({
      ok: true,
      result: { output: "not json" } as never,
      trace: { events: [] } as never,
      accounting: {} as never,
      stopReason: null
    });
    const reviewer = createReviewPileModelReviewer({
      runPile,
      buildContext,
      buildMission
    });
    const result = await reviewer(buildInput());
    assert.equal(result.verdict, "block");
    assert.equal(result.critiques.length, 1);
    const rationale = result.critiques[0]?.rationale ?? "";
    assert.ok(rationale.includes("valid JSON"), `expected parse-error rationale; got ${rationale}`);
  });
});
