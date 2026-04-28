import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { ConfirmedIntent } from "@protostar/intent";
import type { AdmittedPlan } from "@protostar/planning";

import { buildEvaluationMission } from "./evaluation-mission.js";
import {
  EVAL_CONSENSUS_AGENT_DEFAULT,
  evaluationPilePreset,
  reviewPilePreset
} from "./index.js";

const intent: ConfirmedIntent = {
  title: "Cosmetic tweak",
  problem: "The primary button does not visually communicate completion.",
  acceptanceCriteria: [
    { id: "AC-1", statement: "Primary button uses the approved color." },
    { id: "AC-2", statement: "No unrelated files change." }
  ]
} as unknown as ConfirmedIntent;

const plan: AdmittedPlan = {
  planId: "plan-eval-1",
  strategy: "Patch the button style and verify the diff stays scoped.",
  acceptanceCriteria: [
    { id: "AC-1", statement: "Primary button uses the approved color.", verification: "manual" },
    { id: "AC-2", statement: "No unrelated files change.", verification: "automated" }
  ],
  tasks: [
    { id: "task-1", title: "Update button style" },
    { id: "task-2", title: "Verify scoped diff" }
  ]
} as unknown as AdmittedPlan;

function missionText(): string {
  return buildEvaluationMission({
    intent,
    plan,
    diffNameOnly: ["apps/demo/src/Button.tsx", "apps/demo/src/Button.test.tsx"],
    executionEvidence: {
      buildExitCode: 0,
      lintExitCode: 1,
      stdoutTail: "lint: color token mismatch"
    }
  }).intent;
}

describe("evaluationPilePreset", () => {
  it("is the evaluation pile kind", () => {
    assert.equal(evaluationPilePreset.kind, "evaluation");
  });

  it("contains only the baseline agent by default", () => {
    assert.equal(evaluationPilePreset.agents.length, 1);
    assert.equal(evaluationPilePreset.agents[0]?.id, "eval-baseline");
  });

  it("uses Qwen3-Next-80B-A3B-MLX-4bit for the baseline semantic judge", () => {
    assert.equal(evaluationPilePreset.agents[0]?.model, "Qwen3-Next-80B-A3B-MLX-4bit");
    assert.equal(evaluationPilePreset.agents[0]?.role, "semantic-judge");
  });

  it("exports the DeepSeek consensus judge default without adding it to the preset", () => {
    assert.equal(EVAL_CONSENSUS_AGENT_DEFAULT.id, "eval-consensus");
    assert.equal(EVAL_CONSENSUS_AGENT_DEFAULT.role, "consensus-judge");
    assert.equal(EVAL_CONSENSUS_AGENT_DEFAULT.model, "DeepSeek-Coder-V2-Lite-Instruct");
    assert.equal(evaluationPilePreset.agents.some((agent) => agent.id === "eval-consensus"), false);
  });

  it("mirrors the review preset top-level shape", () => {
    assert.deepEqual(Object.keys(evaluationPilePreset).sort(), Object.keys(reviewPilePreset).sort());
  });
});

describe("buildEvaluationMission", () => {
  it("returns an evaluation mission containing all five rubric dimensions", () => {
    const text = missionText();

    for (const dimension of ["acMet", "codeQuality", "security", "regressionRisk", "releaseReadiness"]) {
      assert.match(text, new RegExp(dimension));
    }
  });

  it("contains the confirmed intent problem", () => {
    assert.match(missionText(), /primary button does not visually communicate completion/);
  });

  it("contains every intent acceptance-criteria id", () => {
    const text = missionText();

    assert.match(text, /AC-1/);
    assert.match(text, /AC-2/);
  });

  it("contains every diffNameOnly entry", () => {
    const text = missionText();

    assert.match(text, /apps\/demo\/src\/Button\.tsx/);
    assert.match(text, /apps\/demo\/src\/Button\.test\.tsx/);
  });

  it("contains build and lint exit-code evidence", () => {
    const text = missionText();

    assert.match(text, /build: 0/);
    assert.match(text, /lint: 1/);
  });
});
