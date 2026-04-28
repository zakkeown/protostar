import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cosmeticTweakFixture } from "../internal/test-fixtures/cosmetic-tweak-fixture.js";
import {
  createLmstudioJudgeAdapter,
  LmstudioJudgeParseError
} from "./create-judge-adapter.js";
import { resolveFactoryConfig } from "./factory-config.js";

const MODEL = "qwen3-80b-a3b-mlx-4bit";
const JUDGE_ID = "qwen3-80b-judge-1";

describe("createLmstudioJudgeAdapter", () => {
  it("returns one pass critique with rubric, rationale, model, and all task refs", async () => {
    const reviewer = createLmstudioJudgeAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      judgeId: JUDGE_ID,
      timeoutMs: 1_000,
      fetchImpl: judgeFetch({
        content: JSON.stringify({
          rubric: { "design-quality": 0.8 },
          verdict: "pass",
          rationale: "clean"
        })
      })
    });

    const result = await reviewer(modelReviewInput());

    assert.equal(result.verdict, "pass");
    assert.equal(result.critiques.length, 1);
    assert.deepEqual(result.critiques[0], {
      judgeId: JUDGE_ID,
      model: MODEL,
      rubric: { "design-quality": 0.8 },
      verdict: "pass",
      rationale: "clean",
      taskRefs: ["task-1"]
    });
  });

  it("propagates a repair verdict to the model review result and critique", async () => {
    const reviewer = createLmstudioJudgeAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      judgeId: JUDGE_ID,
      timeoutMs: 1_000,
      fetchImpl: judgeFetch({
        content: JSON.stringify({ rubric: { correctness: 0.4 }, verdict: "repair", rationale: "missed AC" })
      })
    });

    const result = await reviewer(modelReviewInput());

    assert.equal(result.verdict, "repair");
    assert.equal(result.critiques[0]?.verdict, "repair");
  });

  it("throws LmstudioJudgeParseError for malformed judge JSON", async () => {
    const reviewer = createLmstudioJudgeAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      judgeId: JUDGE_ID,
      timeoutMs: 1_000,
      fetchImpl: judgeFetch({ content: "{not json" })
    });

    await assert.rejects(() => reviewer(modelReviewInput()), LmstudioJudgeParseError);
  });

  it("throws on first review when preflight reports the judge model is not loaded", async () => {
    const reviewer = createLmstudioJudgeAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      judgeId: JUDGE_ID,
      timeoutMs: 1_000,
      fetchImpl: judgeFetch({ models: ["qwen3-coder-next-mlx-4bit"] })
    });

    await assert.rejects(() => reviewer(modelReviewInput()), /model-not-loaded/);
  });

  it("uses all admitted plan task ids as v0.1 taskRefs", async () => {
    const reviewer = createLmstudioJudgeAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      judgeId: JUDGE_ID,
      timeoutMs: 1_000,
      fetchImpl: judgeFetch({
        content: JSON.stringify({ rubric: { scope: 0.9 }, verdict: "pass", rationale: "all good" })
      })
    });

    const result = await reviewer(modelReviewInput());

    assert.deepEqual(result.critiques[0]?.taskRefs, ["task-1"]);
  });

  it("captures open-key rubric values verbatim", async () => {
    const reviewer = createLmstudioJudgeAdapter({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: MODEL,
      judgeId: JUDGE_ID,
      timeoutMs: 1_000,
      fetchImpl: judgeFetch({
        content: JSON.stringify({ rubric: { foo: 0.3, bar: 0.5 }, verdict: "block", rationale: "unsafe" })
      })
    });

    const result = await reviewer(modelReviewInput());

    assert.deepEqual(result.critiques[0]?.rubric, { foo: 0.3, bar: 0.5 });
    assert.equal(result.verdict, "block");
  });

  it("resolves factory config with required coder and judge adapter blocks", () => {
    const result = resolveFactoryConfig({
      fileBytes: JSON.stringify({
        adapters: {
          coder: { model: "qwen3-coder-next-mlx-4bit" },
          judge: { model: MODEL, apiKeyEnv: "LMSTUDIO_JUDGE_API_KEY" }
        }
      }),
      env: {}
    });

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected config resolution to succeed");
    assert.equal(result.resolved.config.adapters.coder.model, "qwen3-coder-next-mlx-4bit");
    assert.equal(result.resolved.config.adapters.judge?.model, MODEL);
    assert.equal(result.resolved.config.adapters.judge?.apiKeyEnv, "LMSTUDIO_JUDGE_API_KEY");
  });
});

function modelReviewInput() {
  return {
    admittedPlan: cosmeticTweakFixture.admittedPlan,
    executionResult: { status: "completed" },
    mechanicalGate: {
      planId: cosmeticTweakFixture.admittedPlan.planId,
      runId: "run-judge-fixture",
      verdict: "pass",
      findings: []
    },
    diff: {
      nameOnly: ["src/Button.tsx"],
      unifiedDiff: cosmeticTweakFixture.expectedDiffSample
    }
  } as const;
}

function judgeFetch(opts: {
  readonly models?: readonly string[];
  readonly content?: string;
}): typeof fetch {
  return (async (input) => {
    const url = String(input);
    if (url.endsWith("/models")) {
      return Response.json({
        data: (opts.models ?? [MODEL]).map((id) => ({ id }))
      });
    }
    if (url.endsWith("/chat/completions")) {
      return Response.json({
        choices: [
          {
            message: {
              content:
                opts.content ??
                JSON.stringify({ rubric: { default: 1 }, verdict: "pass", rationale: "ok" })
            }
          }
        ]
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}
