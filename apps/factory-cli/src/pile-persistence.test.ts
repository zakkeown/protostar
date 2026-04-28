import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import type { PileRunOutcome } from "@protostar/dogpile-adapter";
import type { Trace, RunResult, RunAccounting } from "@protostar/dogpile-types";

import { writePileArtifacts } from "./pile-persistence.js";

const stubTrace: Trace = {
  events: [],
  // Cast to satisfy whatever optional fields Trace carries; the persistence
  // helper only round-trips JSON.
} as unknown as Trace;
const stubResult: RunResult = {
  output: "stub-output",
  eventLog: { events: [] }
} as unknown as RunResult;
const stubAccounting: RunAccounting = {
  totalTokens: 0
} as unknown as RunAccounting;

const okOutcome: PileRunOutcome = {
  ok: true,
  result: stubResult,
  trace: stubTrace,
  accounting: stubAccounting,
  stopReason: null
};

const failOutcome: PileRunOutcome = {
  ok: false,
  failure: {
    kind: "planning",
    class: "pile-timeout",
    elapsedMs: 120_000,
    configuredTimeoutMs: 120_000
  }
};

describe("writePileArtifacts (Q-07/Q-08)", () => {
  it("ok=true writes result.json AND trace.json; no refusal.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "pile-persistence-"));
    try {
      const paths = await writePileArtifacts({
        runRoot: root,
        runId: "run_a",
        kind: "planning",
        iteration: 0,
        outcome: okOutcome
      });
      const dir = resolve(root, "runs", "run_a", "piles", "planning", "iter-0");
      const files = await readdir(dir);
      assert.ok(files.includes("result.json"));
      assert.ok(files.includes("trace.json"));
      assert.equal(files.includes("refusal.json"), false);
      assert.ok(paths.resultPath);
      assert.ok(paths.tracePath);
      assert.equal(paths.refusalPath, undefined);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("ok=false writes refusal.json only; no result.json/trace.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "pile-persistence-"));
    try {
      const paths = await writePileArtifacts({
        runRoot: root,
        runId: "run_b",
        kind: "review",
        iteration: 1,
        outcome: failOutcome,
        refusal: {
          reason: "pile-timeout: review elapsed 120000ms",
          stage: "pile-review",
          sourceOfTruth: "ReviewPileResult"
        }
      });
      const dir = resolve(root, "runs", "run_b", "piles", "review", "iter-1");
      const files = await readdir(dir);
      assert.ok(files.includes("refusal.json"));
      assert.equal(files.includes("result.json"), false);
      assert.equal(files.includes("trace.json"), false);
      assert.ok(paths.refusalPath);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("trace.json round-trips deeply", async () => {
    const root = await mkdtemp(join(tmpdir(), "pile-persistence-"));
    try {
      await writePileArtifacts({
        runRoot: root,
        runId: "run_c",
        kind: "planning",
        iteration: 0,
        outcome: okOutcome
      });
      const trace = JSON.parse(
        await readFile(resolve(root, "runs", "run_c", "piles", "planning", "iter-0", "trace.json"), "utf8")
      );
      assert.deepEqual(trace, JSON.parse(JSON.stringify(okOutcome.ok ? okOutcome.trace : null)));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("layout: writes go to runs/<id>/piles/<kind>/iter-<N>/ for execution-coordination", async () => {
    const root = await mkdtemp(join(tmpdir(), "pile-persistence-"));
    try {
      await writePileArtifacts({
        runRoot: root,
        runId: "run_d",
        kind: "execution-coordination",
        iteration: 2,
        outcome: okOutcome
      });
      const dir = resolve(root, "runs", "run_d", "piles", "execution-coordination", "iter-2");
      const files = await readdir(dir);
      assert.ok(files.includes("result.json"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects runIds that escape the runs/ root (T-6-23 path traversal)", async () => {
    const root = await mkdtemp(join(tmpdir(), "pile-persistence-"));
    try {
      await assert.rejects(
        () =>
          writePileArtifacts({
            runRoot: root,
            runId: "../escape",
            kind: "planning",
            iteration: 0,
            outcome: okOutcome
          }),
        /path traversal|outside/i
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
