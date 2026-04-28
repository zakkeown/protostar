/**
 * Phase 6 Plan 06-05 Task 2 — `createReviewPileModelReviewer`.
 *
 * Q-14 retroactive lock: Phase 5 ships only the `ModelReviewer` interface +
 * fixture passthrough; this module supplies the live implementation that
 * replaces the dropped single-Qwen judge with the review-pile aggregate.
 *
 * The reviewer is a thin translator:
 *   1. Caller (factory-cli) supplies `buildMission` + `buildContext` closures
 *      that close over the confirmed intent, planning admission, provider,
 *      signal, and resolved budget.
 *   2. We invoke `runFactoryPile(mission, ctx)`.
 *   3. On `ok: true`, parse the output via `parseReviewPileResult`; map the
 *      body to `ModelReviewResult`.
 *   4. On `ok: false` or parse error, synthesize a block-verdict
 *      `ModelReviewResult` carrying the failure as a JudgeCritique rationale
 *      (Q-12 refusal symmetry).
 *
 * Phase 5 `ModelReviewer` is a function type (not `{ review() }`). This module
 * returns a function so that
 *   `const reviewer: ModelReviewer = createReviewPileModelReviewer(deps);`
 * type-checks.
 */

import type {
  FactoryPileMission,
  PileFailure,
  PileRunContext,
  PileRunOutcome
} from "@protostar/dogpile-adapter";
import { runFactoryPile as defaultRunFactoryPile } from "@protostar/dogpile-adapter";

import type { JudgeCritique } from "./judge-types.js";
import { parseReviewPileResult } from "./review-pile-result.js";
import type {
  ModelReviewInput,
  ModelReviewResult,
  ModelReviewer
} from "./repair-types.js";

export interface ReviewPileModelReviewerDeps {
  /** Injectable for tests; defaults to `runFactoryPile`. */
  readonly runPile?: (
    mission: FactoryPileMission,
    ctx: PileRunContext
  ) => Promise<PileRunOutcome>;
  /** Caller supplies factory-cli's runtime context (provider/signal/budget). */
  readonly buildContext: (input: ModelReviewInput) => PileRunContext;
  /**
   * Caller closes over confirmed intent + planning admission to construct the
   * mission. Phase 5's `ModelReviewInput` does not carry these fields, so
   * factory-cli (Plan 07) provides the closure.
   */
  readonly buildMission: (input: ModelReviewInput) => FactoryPileMission;
}

function taskRefsFromInput(input: ModelReviewInput): readonly string[] {
  return input.admittedPlan.tasks.map((task) => task.planTaskId);
}

function blockFromPileFailure(
  failure: PileFailure,
  taskRefs: readonly string[]
): ModelReviewResult {
  const reasonSuffix =
    failure.class === "pile-cancelled" ? `:${failure.reason}` : "";
  const summary = `${failure.class}${reasonSuffix}`;
  return {
    verdict: "block",
    critiques: [
      {
        judgeId: "review-pile",
        model: "review-pile",
        rubric: {},
        verdict: "block",
        rationale: `Review pile failed: ${summary}. ${JSON.stringify(failure)}`,
        taskRefs
      }
    ]
  };
}

function blockFromParseErrors(
  errors: readonly string[],
  taskRefs: readonly string[]
): ModelReviewResult {
  return {
    verdict: "block",
    critiques: [
      {
        judgeId: "review-pile",
        model: "review-pile",
        rubric: {},
        verdict: "block",
        rationale: `Review pile output failed to parse: ${errors.join("; ")}`,
        taskRefs
      }
    ]
  };
}

export function createReviewPileModelReviewer(
  deps: ReviewPileModelReviewerDeps
): ModelReviewer {
  const runPile = deps.runPile ?? defaultRunFactoryPile;
  return async (input: ModelReviewInput): Promise<ModelReviewResult> => {
    const mission = deps.buildMission(input);
    const ctx = deps.buildContext(input);
    const outcome = await runPile(mission, ctx);
    const taskRefs = taskRefsFromInput(input);

    if (outcome.ok === false) {
      return blockFromPileFailure(outcome.failure, taskRefs);
    }

    const parsed = parseReviewPileResult({ output: outcome.result.output });
    if (parsed.ok === false) {
      return blockFromParseErrors(parsed.errors, taskRefs);
    }

    return {
      verdict: parsed.body.aggregateVerdict,
      critiques: parsed.body.judgeCritiques as readonly JudgeCritique[]
    };
  };
}
