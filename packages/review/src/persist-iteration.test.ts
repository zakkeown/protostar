/// <reference types="node" />

import assert from "node:assert/strict";
import { mkdtemp, readFile, rename, mkdir, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { FsAdapter } from "@protostar/repo";

import { createReviewPersistence } from "./persist-iteration.js";
import type { RepairPlan, ReviewLifecycleEvent } from "./index.js";

describe("createReviewPersistence", () => {
  it("writes mechanical, model, and repair-plan JSON files for an iteration", async () => {
    const fs = recordingFs();
    const persistence = createReviewPersistence({ fs, runsRoot: "/runs" });

    await persistence.writeIterationDir({
      runId: "r-1",
      attempt: 2,
      mechanical: { schemaVersion: "1.0.0", verdict: "repair" },
      model: { verdict: "repair" },
      repairPlan: repairPlan()
    });

    assert.deepEqual(fs.renameCalls.map((call) => call.to), [
      "/runs/r-1/review/iter-2/mechanical-result.json",
      "/runs/r-1/review/iter-2/model-result.json",
      "/runs/r-1/review/iter-2/repair-plan.json"
    ]);
    for (const content of fs.writeCalls.map((call) => call.content)) {
      assert.doesNotThrow(() => JSON.parse(content));
    }
  });

  it("omits model-result.json when model is undefined", async () => {
    const fs = recordingFs();
    const persistence = createReviewPersistence({ fs, runsRoot: "/runs" });

    await persistence.writeIterationDir({
      runId: "r-1",
      attempt: 1,
      mechanical: { verdict: "repair" },
      repairPlan: repairPlan()
    });

    assert.deepEqual(fs.renameCalls.map((call) => call.to), [
      "/runs/r-1/review/iter-1/mechanical-result.json",
      "/runs/r-1/review/iter-1/repair-plan.json"
    ]);
  });

  it("writes strict pass/pass review-decision.json artifacts", async () => {
    const fs = recordingFs();
    const persistence = createReviewPersistence({ fs, runsRoot: "/runs" });

    const { decisionPath } = await persistence.writeReviewDecision({
      runId: "r-1",
      artifact: {
        schemaVersion: "1.0.0",
        runId: "r-1",
        planId: "plan-1",
        mechanical: "pass",
        model: "pass"
      }
    });

    const written = JSON.parse(fs.writeCalls[0]?.content ?? "{}");
    assert.equal(decisionPath, "/runs/r-1/review/review-decision.json");
    assert.equal(written.schemaVersion, "1.0.0");
    assert.equal(written.mechanical, "pass");
    assert.equal(written.model, "pass");
  });

  it("writes review-block.json with a closed reason discriminator", async () => {
    const fs = recordingFs();
    const persistence = createReviewPersistence({ fs, runsRoot: "/runs" });

    await persistence.writeReviewBlock({
      runId: "r-1",
      artifact: {
        schemaVersion: "1.0.0",
        runId: "r-1",
        planId: "plan-1",
        status: "block",
        reason: "budget-exhausted",
        iterations: [],
        exhaustedBudget: { maxRepairLoops: 1, attempted: 1 }
      }
    });

    const written = JSON.parse(fs.writeCalls[0]?.content ?? "{}");
    assert.equal(written.schemaVersion, "1.0.0");
    assert.equal(written.reason, "budget-exhausted");
  });

  it("rejects review-block.json artifacts with unknown reasons", async () => {
    const persistence = createReviewPersistence({ fs: recordingFs(), runsRoot: "/runs" });

    await assert.rejects(
      () =>
        persistence.writeReviewBlock({
          runId: "r-1",
          artifact: {
            schemaVersion: "1.0.0",
            reason: "surprise"
          }
        }),
      /known discriminator/
    );
  });

  it("appends JSONL lifecycle events through appendFile with a trailing newline", async () => {
    const fs = recordingFs();
    const persistence = createReviewPersistence({ fs, runsRoot: "/runs" });

    await persistence.appendLifecycleEvent({ runId: "r-1", event: lifecycleEvent(0) });

    assert.equal(fs.appendCalls.length, 1);
    assert.equal(fs.appendCalls[0]?.path, "/runs/r-1/review/review.jsonl");
    assert.ok(fs.appendCalls[0]?.content.endsWith("\n"));
    assert.equal(fs.fsyncCalls.includes("/runs/r-1/review/review.jsonl"), true);
  });

  it("appends multiple lifecycle events as parseable JSON lines", async () => {
    const fs = recordingFs();
    const persistence = createReviewPersistence({ fs, runsRoot: "/runs" });

    await persistence.appendLifecycleEvent({ runId: "r-1", event: lifecycleEvent(0) });
    await persistence.appendLifecycleEvent({ runId: "r-1", event: lifecycleEvent(1) });

    const lines = fs.appendCalls.map((call) => call.content).join("").trimEnd().split("\n");
    assert.equal(lines.length, 2);
    assert.deepEqual(lines.map((line) => JSON.parse(line).attempt), [0, 1]);
  });

  it("uses tmp plus rename writes that read back as complete JSON with a real adapter", async () => {
    const root = await mkdtemp(join(tmpdir(), "protostar-review-persist-"));
    const persistence = createReviewPersistence({
      fs: nodeFsAdapter(),
      runsRoot: root
    });

    await persistence.writeIterationDir({
      runId: "r-1",
      attempt: 3,
      mechanical: { payload: "x".repeat(1024 * 1024) }
    });

    const raw = await readFile(join(root, "r-1/review/iter-3/mechanical-result.json"), "utf8");
    assert.equal(JSON.parse(raw).payload.length, 1024 * 1024);
  });
});

interface RecordingFs extends FsAdapter {
  readonly writeCalls: { readonly path: string; readonly content: string }[];
  readonly appendCalls: { readonly path: string; readonly content: string }[];
  readonly renameCalls: { readonly from: string; readonly to: string }[];
  readonly fsyncCalls: string[];
}

function recordingFs(): RecordingFs {
  const writeCalls: RecordingFs["writeCalls"] = [];
  const appendCalls: RecordingFs["appendCalls"] = [];
  const renameCalls: RecordingFs["renameCalls"] = [];
  const fsyncCalls: string[] = [];
  return {
    writeCalls,
    appendCalls,
    renameCalls,
    fsyncCalls,
    async mkdir() {},
    async writeFile(path, content) {
      writeCalls.push({ path, content: String(content) });
    },
    async appendFile(path, content) {
      appendCalls.push({ path, content: String(content) });
    },
    async rename(from, to) {
      renameCalls.push({ from, to });
    },
    async fsync(path) {
      fsyncCalls.push(path);
    }
  };
}

function nodeFsAdapter(): FsAdapter {
  return {
    async mkdir(path, options) {
      await mkdir(path, options);
    },
    async writeFile(path, content) {
      await writeFile(path, content);
    },
    async appendFile(path, content) {
      await appendFile(path, content);
    },
    async rename(from, to) {
      await rename(from, to);
    },
    async fsync() {}
  };
}

function lifecycleEvent(attempt: number): ReviewLifecycleEvent {
  return {
    kind: "review-iteration-started",
    runId: "r-1",
    attempt,
    at: "2026-04-28T01:00:00.000Z"
  };
}

function repairPlan(): RepairPlan {
  return {
    runId: "r-1",
    attempt: 1,
    repairs: [],
    dependentTaskIds: []
  };
}
