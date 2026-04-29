import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_EVOLUTION_GENERATIONS } from "@protostar/evaluation";

import { ArgvError, parseCliArgs } from "./cli-args.js";

describe("factory CLI argv parser", () => {
  it("defaults trust to untrusted when the flag is absent", () => {
    assert.equal(parseCliArgs(["run", "--draft", "draft.json", "--out", "out"]).trust, "untrusted");
  });

  it("parses --trust trusted", () => {
    assert.equal(parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--trust", "trusted"]).trust, "trusted");
  });

  it("parses --trust=trusted", () => {
    assert.equal(parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--trust=trusted"]).trust, "trusted");
  });

  it("rejects unsupported trust values with ArgvError", () => {
    assert.throws(
      () => parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--trust", "root"]),
      (error: unknown) => error instanceof ArgvError && error.flag === "--trust"
    );
  });

  it("parses --confirmed-intent path", () => {
    assert.equal(
      parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--confirmed-intent", "/tmp/intent.json"])
        .confirmedIntent,
      "/tmp/intent.json"
    );
  });

  it("parses --confirmed-intent=path", () => {
    assert.equal(
      parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--confirmed-intent=/tmp/intent.json"])
        .confirmedIntent,
      "/tmp/intent.json"
    );
  });

  it("rejects --confirmed-intent with no path", () => {
    assert.throws(
      () => parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--confirmed-intent"]),
      (error: unknown) => error instanceof ArgvError && error.flag === "--confirmed-intent"
    );
  });

  // Phase 6 Plan 06-07 Task 1 — pile-mode CLI flags.
  it("parses --planning-mode live", () => {
    assert.equal(
      parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--planning-mode", "live"]).planningMode,
      "live"
    );
  });

  it("parses --planning-mode fixture, --review-mode live, --exec-coord-mode live simultaneously", () => {
    const parsed = parseCliArgs([
      "run",
      "--draft", "d.json",
      "--out", "o",
      "--planning-mode", "fixture",
      "--review-mode", "live",
      "--exec-coord-mode", "live"
    ]);
    assert.equal(parsed.planningMode, "fixture");
    assert.equal(parsed.reviewMode, "live");
    assert.equal(parsed.execCoordMode, "live");
  });

  it("rejects --planning-mode invalid", () => {
    assert.throws(
      () => parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--planning-mode", "auto"]),
      (error: unknown) => error instanceof ArgvError && error.flag === "--planning-mode"
    );
  });

  // Phase 8 Plan 08-07 Task 1 — evaluation/evolution CLI flags.
  it("parses --lineage id", () => {
    assert.equal(parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--lineage", "cosmetic-1"]).lineage, "cosmetic-1");
  });

  it("rejects --lineage with an empty inline value", () => {
    assert.throws(
      () => parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--lineage="]),
      (error: unknown) => error instanceof ArgvError && error.flag === "--lineage"
    );
  });

  it("parses --evolve-code as a boolean flag without a value", () => {
    const parsed = parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--evolve-code"]);

    assert.equal(parsed.evolveCode, true);
  });

  it("parses --generation within the evolution generation cap", () => {
    assert.equal(parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--generation", "0"]).generation, 0);
    assert.equal(
      parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--generation", String(MAX_EVOLUTION_GENERATIONS)]).generation,
      MAX_EVOLUTION_GENERATIONS
    );
  });

  it("rejects negative --generation values", () => {
    assert.throws(
      () => parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--generation", "-1"]),
      (error: unknown) =>
        error instanceof ArgvError &&
        error.flag === "--generation" &&
        /integer >= 0/.test(error.reason)
    );
  });

  it("rejects non-integer --generation values", () => {
    assert.throws(
      () => parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--generation", "abc"]),
      (error: unknown) =>
        error instanceof ArgvError &&
        error.flag === "--generation" &&
        /integer/.test(error.reason)
    );
  });

  it("rejects over-cap --generation values", () => {
    assert.throws(
      () => parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--generation", "31"]),
      (error: unknown) =>
        error instanceof ArgvError &&
        error.flag === "--generation" &&
        error.reason.includes(String(MAX_EVOLUTION_GENERATIONS))
    );
  });

  it("parses --semantic-judge-model", () => {
    assert.equal(
      parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--semantic-judge-model", "qwen-custom"]).semanticJudgeModel,
      "qwen-custom"
    );
  });

  it("parses --consensus-judge-model", () => {
    assert.equal(
      parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--consensus-judge-model", "deepseek-custom"]).consensusJudgeModel,
      "deepseek-custom"
    );
  });

  it("parses --headless-mode github-hosted", () => {
    assert.equal(
      parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--headless-mode", "github-hosted"]).headlessMode,
      "github-hosted"
    );
  });

  it("parses --headless-mode=self-hosted-runner", () => {
    assert.equal(
      parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--headless-mode=self-hosted-runner"]).headlessMode,
      "self-hosted-runner"
    );
  });

  it("rejects unsupported --headless-mode values", () => {
    assert.throws(
      () => parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--headless-mode", "ci"]),
      (error: unknown) =>
        error instanceof ArgvError &&
        error.flag === "--headless-mode" &&
        /github-hosted\|self-hosted-runner\|local-daemon/.test(error.reason)
    );
  });

  it("parses --llm-backend=mock", () => {
    assert.equal(
      parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--llm-backend=mock"]).llmBackend,
      "mock"
    );
  });

  it("rejects unsupported --llm-backend values", () => {
    assert.throws(
      () => parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--llm-backend", "openai"]),
      (error: unknown) =>
        error instanceof ArgvError &&
        error.flag === "--llm-backend" &&
        /lmstudio\|hosted-openai-compatible\|mock/.test(error.reason)
    );
  });

  it("parses --non-interactive as a boolean flag without a value", () => {
    const parsed = parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--non-interactive"]);

    assert.equal(parsed.nonInteractive, true);
  });

  it("rejects --non-interactive values", () => {
    assert.throws(
      () => parseCliArgs(["run", "--draft", "d.json", "--out", "o", "--non-interactive=true"]),
      (error: unknown) => error instanceof ArgvError && error.flag === "--non-interactive"
    );
  });
});
