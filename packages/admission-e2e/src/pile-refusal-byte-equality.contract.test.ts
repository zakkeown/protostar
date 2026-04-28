/**
 * Phase 6 Plan 06-08 Task 2 — refusal-byte-equal contract (PILE-04).
 *
 * Asserts evidence-uniformity (Q-12) between two pile-refusal artifacts that
 * arrive at the boundary from different origins:
 *
 *   A. Fixture-parse failure: `parsePlanningPileResult({ kind, output: "not json" })`
 *      returns parse errors; we wrap those errors into a `PileFailure` of
 *      class `pile-schema-parse` and persist via `writePileArtifacts`.
 *
 *   B. Pile-schema-parse failure: a synthesized `PileFailure` of class
 *      `pile-schema-parse` (the SAME shape produced when a live pile returns
 *      output that fails JSON.parse or schema validation).
 *
 * Per D-12 (Q-12): refusal symmetry. Per D-06 (Q-06): live failure is a
 * first-class refusal, never silently substituted. The two artifacts MUST be
 * byte-equal modulo `failure.parseErrors` (the only legitimate discriminator
 * between origins). All other top-level keys — schemaVersion, artifact, runId,
 * kind, iteration, stage, reason, sourceOfTruth, failure.kind, failure.class,
 * failure.sourceOfTruth — must agree.
 */

import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import type { PileFailure, PileRunOutcome } from "@protostar/dogpile-adapter";
import {
  parsePlanningPileResult,
  type PlanningPileResult
} from "@protostar/planning";
import { writePileArtifacts } from "@protostar/factory-cli/pile-persistence";

const RUN_ID = "run_byte_equal_test";
const ITERATION = 0;

interface RefusalArtifactBody {
  readonly schemaVersion: string;
  readonly artifact: string;
  readonly runId: string;
  readonly kind: string;
  readonly iteration: number;
  readonly stage: string;
  readonly reason: string;
  readonly sourceOfTruth: string;
  readonly failure: PileFailure;
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "pile-byte-equal-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeAndRead(
  runDir: string,
  outcome: PileRunOutcome
): Promise<RefusalArtifactBody> {
  if (outcome.ok) {
    throw new Error("byte-equality test requires outcome.ok=false");
  }
  const result = await writePileArtifacts({
    runDir,
    runId: RUN_ID,
    kind: "planning",
    iteration: ITERATION,
    outcome,
    refusal: {
      reason: "Planning pile output is not valid JSON",
      stage: "pile-planning",
      sourceOfTruth: "PlanningPileResult"
    }
  });
  assert.ok(result.refusalPath, "writePileArtifacts must produce refusalPath on outcome.ok=false");
  const body = JSON.parse(await readFile(result.refusalPath as string, "utf8")) as RefusalArtifactBody;
  return body;
}

describe("pile-refusal-byte-equal (PILE-04 / Q-12 refusal symmetry)", () => {
  it("refusal-byte-equal: fixture-parse and pile-schema-parse refusals share schema modulo parseErrors", async () => {
    await withTempDir(async (tempA) => {
      await withTempDir(async (tempB) => {
        // ---------- Path A: fixture-parse failure → pile-schema-parse PileFailure ----------
        const fixtureResult: PlanningPileResult = {
          kind: "planning-pile-result",
          output: "not json",
          source: "fixture"
        };
        const intentStub = {
          id: "intent_byte_equal",
          acceptanceCriteria: []
        } as unknown as Parameters<typeof parsePlanningPileResult>[1]["intent"];
        const parsed = parsePlanningPileResult(fixtureResult, {
          intent: intentStub,
          defaultPlanId: "plan_byte_equal"
        });
        assert.equal(parsed.ok, false, "fixture parse must fail for invalid JSON output");
        if (parsed.ok) return;
        const failureA: PileFailure = {
          kind: "planning",
          class: "pile-schema-parse",
          sourceOfTruth: "PlanningPileResult",
          parseErrors: parsed.errors
        };
        const outcomeA: PileRunOutcome = { ok: false, failure: failureA };
        const bodyA = await writeAndRead(tempA, outcomeA);

        // ---------- Path B: pile-schema-parse failure (live origin) ----------
        const failureB: PileFailure = {
          kind: "planning",
          class: "pile-schema-parse",
          sourceOfTruth: "PlanningPileResult",
          parseErrors: ["live: malformed pile output (synthetic)"]
        };
        const outcomeB: PileRunOutcome = { ok: false, failure: failureB };
        const bodyB = await writeAndRead(tempB, outcomeB);

        // ---------- byte-equality up to the parseErrors discriminator ----------
        // 1. Both refusal artifacts are well-formed.
        assert.equal(bodyA.schemaVersion, "1.0.0");
        assert.equal(bodyB.schemaVersion, "1.0.0");
        assert.equal(bodyA.artifact, "refusal.json");
        assert.equal(bodyB.artifact, "refusal.json");

        // 2. All schema-uniform fields agree exactly.
        assert.equal(bodyA.runId, bodyB.runId);
        assert.equal(bodyA.kind, bodyB.kind);
        assert.equal(bodyA.iteration, bodyB.iteration);
        assert.equal(bodyA.stage, bodyB.stage);
        assert.equal(bodyA.reason, bodyB.reason);
        assert.equal(bodyA.sourceOfTruth, bodyB.sourceOfTruth);

        // 3. Failure discriminator agrees on kind/class/sourceOfTruth.
        assert.equal(bodyA.failure.kind, bodyB.failure.kind);
        assert.equal(bodyA.failure.class, bodyB.failure.class);
        if (bodyA.failure.class === "pile-schema-parse" && bodyB.failure.class === "pile-schema-parse") {
          assert.equal(bodyA.failure.sourceOfTruth, bodyB.failure.sourceOfTruth);
        }

        // 4. The ONLY structural difference is failure.parseErrors (the
        //    fixture-vs-live origin discriminator). After erasing it, the
        //    artifacts are deepEqual.
        const stripParseErrors = (body: RefusalArtifactBody) => {
          const { failure, ...rest } = body;
          if (failure.class !== "pile-schema-parse") return { ...rest, failureClass: failure.class };
          const { parseErrors: _ignored, ...failureRest } = failure;
          return { ...rest, failure: failureRest };
        };
        assert.deepEqual(stripParseErrors(bodyA), stripParseErrors(bodyB));

        // 5. The discriminator field itself is non-trivial in both refusals
        //    (i.e., the symmetry is meaningful, not vacuous).
        if (bodyA.failure.class === "pile-schema-parse") {
          assert.ok(
            bodyA.failure.parseErrors.length > 0,
            "fixture-parse path must populate parseErrors with at least one diagnostic"
          );
        }
        if (bodyB.failure.class === "pile-schema-parse") {
          assert.ok(
            bodyB.failure.parseErrors.length > 0,
            "live pile-schema-parse path must populate parseErrors with at least one diagnostic"
          );
        }
      });
    });
  });

  it("refusal-byte-equal: writePileArtifacts produces refusal.json at the expected per-pile path", async () => {
    await withTempDir(async (tempDir) => {
      const failure: PileFailure = {
        kind: "planning",
        class: "pile-schema-parse",
        sourceOfTruth: "PlanningPileResult",
        parseErrors: ["irrelevant"]
      };
      const result = await writePileArtifacts({
        runDir: tempDir,
        runId: RUN_ID,
        kind: "planning",
        iteration: ITERATION,
        outcome: { ok: false, failure },
        refusal: {
          reason: "test reason",
          stage: "pile-planning",
          sourceOfTruth: "PlanningPileResult"
        }
      });
      const expected = resolve(tempDir, "piles", "planning", "iter-0", "refusal.json");
      assert.equal(result.refusalPath, expected);
      assert.equal(result.resultPath, undefined);
      assert.equal(result.tracePath, undefined);
    });
  });
});
