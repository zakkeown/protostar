import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import type { FactoryRunManifest, FactoryRunStatus } from "@protostar/artifacts";

import { computeRunLiveness } from "./run-liveness.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("computeRunLiveness", () => {
  it("returns live for a running manifest with a fresh journal and no cancel sentinel", async () => {
    const runDir = await tempRunDir();
    await writeManifest(runDir, "running");
    await writeJournal(runDir, 1_700_000_000_000);

    const liveness = await computeRunLiveness({
      runDir,
      thresholdMs: 60_000,
      nowMs: 1_700_000_030_000
    });

    assert.equal(liveness.state, "live");
    assert.equal(liveness.manifestStatus, "running");
    assert.equal(liveness.lastJournalAt, 1_700_000_000_000);
    assert.equal(liveness.hasSentinel, false);
  });

  it("returns orphaned for a stale running manifest without a cancel sentinel", async () => {
    const runDir = await tempRunDir();
    await writeManifest(runDir, "running");
    await writeJournal(runDir, 1_700_000_000_000);

    const liveness = await computeRunLiveness({
      runDir,
      thresholdMs: 60_000,
      nowMs: 1_700_000_060_001
    });

    assert.equal(liveness.state, "orphaned");
  });

  it("returns unknown with an error when manifest.json is missing", async () => {
    const runDir = await tempRunDir();

    const liveness = await computeRunLiveness({ runDir, thresholdMs: 60_000, nowMs: 1 });

    assert.equal(liveness.state, "unknown");
    assert.equal(liveness.manifestStatus, null);
    assert.equal(liveness.lastJournalAt, null);
    assert.equal(liveness.hasSentinel, false);
    assert.match(liveness.error ?? "", /manifest\.json/);
  });

  it("returns unknown with an error when manifest.json is unparseable", async () => {
    const runDir = await tempRunDir();
    await writeFile(join(runDir, "manifest.json"), "{ nope", "utf8");

    const liveness = await computeRunLiveness({ runDir, thresholdMs: 60_000, nowMs: 1 });

    assert.equal(liveness.state, "unknown");
    assert.match(liveness.error ?? "", /parse|JSON|Unexpected/i);
  });

  it("reports hasSentinel=true when CANCEL exists", async () => {
    const runDir = await tempRunDir();
    await writeManifest(runDir, "running");
    await writeJournal(runDir, 1_700_000_000_000);
    await writeFile(join(runDir, "CANCEL"), "", "utf8");

    const liveness = await computeRunLiveness({
      runDir,
      thresholdMs: 60_000,
      nowMs: 1_700_000_180_000
    });

    assert.equal(liveness.hasSentinel, true);
    assert.equal(liveness.state, "live");
  });

  it("uses lastJournalAt=null when journal.jsonl is absent", async () => {
    const runDir = await tempRunDir();
    await writeManifest(runDir, "created");

    const liveness = await computeRunLiveness({ runDir, thresholdMs: 60_000, nowMs: 1 });

    assert.equal(liveness.state, "live");
    assert.equal(liveness.lastJournalAt, null);
  });

  it("returns terminal manifest status as the state", async () => {
    const runDir = await tempRunDir();
    await writeManifest(runDir, "completed");

    const liveness = await computeRunLiveness({ runDir, thresholdMs: 60_000, nowMs: 1 });

    assert.equal(liveness.state, "completed");
    assert.equal(liveness.manifestStatus, "completed");
  });

  it("uses nowMs injection for deterministic stale checks", async () => {
    const runDir = await tempRunDir();
    await writeManifest(runDir, "running");
    await writeJournal(runDir, 1_700_000_000_000);

    const fresh = await computeRunLiveness({
      runDir,
      thresholdMs: 60_000,
      nowMs: 1_700_000_060_000
    });
    const stale = await computeRunLiveness({
      runDir,
      thresholdMs: 60_000,
      nowMs: 1_700_000_060_001
    });

    assert.equal(fresh.state, "live");
    assert.equal(stale.state, "orphaned");
  });
});

async function tempRunDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "run-liveness-"));
  tempRoots.push(root);
  const runDir = join(root, "run_1");
  await mkdir(runDir, { recursive: true });
  return runDir;
}

async function writeManifest(runDir: string, status: FactoryRunStatus): Promise<void> {
  const manifest: FactoryRunManifest = {
    runId: "run_1",
    intentId: "intent_1" as never,
    status,
    createdAt: "2026-04-28T00:00:00.000Z",
    stages: []
  };
  await writeFile(join(runDir, "manifest.json"), JSON.stringify(manifest), "utf8");
}

async function writeJournal(runDir: string, mtimeMs: number): Promise<void> {
  const executionDir = join(runDir, "execution");
  await mkdir(executionDir, { recursive: true });
  const journalPath = join(executionDir, "journal.jsonl");
  await writeFile(journalPath, "{}\n", "utf8");
  const time = new Date(mtimeMs);
  await utimes(journalPath, time, time);
}
