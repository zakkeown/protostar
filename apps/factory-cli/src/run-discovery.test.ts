import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { RUN_ID_REGEX } from "./run-id.js";
import { listRuns } from "./run-discovery.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("listRuns", () => {
  it("returns run directories sorted by mtime descending", async () => {
    const runsRoot = await tempRunsRoot();
    await makeRunDir(runsRoot, "run_old", 1_700_000_000_000);
    await makeRunDir(runsRoot, "run_new", 1_700_000_120_000);
    await makeRunDir(runsRoot, "run_mid", 1_700_000_060_000);

    const entries = await listRuns({ runsRoot, runIdRegex: RUN_ID_REGEX, all: true });

    assert.deepEqual(entries.map((entry) => entry.runId), ["run_new", "run_mid", "run_old"]);
    assert.ok(entries.every((entry) => entry.path.startsWith(runsRoot)));
  });

  it("returns the default-limited most recent runs", async () => {
    const runsRoot = await tempRunsRoot();
    await makeRunDir(runsRoot, "run_1", 1_700_000_000_000);
    await makeRunDir(runsRoot, "run_2", 1_700_000_060_000);
    await makeRunDir(runsRoot, "run_3", 1_700_000_120_000);

    const entries = await listRuns({ runsRoot, runIdRegex: RUN_ID_REGEX, limit: 2 });

    assert.deepEqual(entries.map((entry) => entry.runId), ["run_3", "run_2"]);
  });

  it("filters to entries newer than now minus sinceMs", async () => {
    const runsRoot = await tempRunsRoot();
    const nowMs = 1_700_000_120_000;
    await makeRunDir(runsRoot, "run_old", nowMs - 61_000);
    await makeRunDir(runsRoot, "run_recent", nowMs - 60_000);
    await makeRunDir(runsRoot, "run_new", nowMs);

    const entries = await listRuns({ runsRoot, runIdRegex: RUN_ID_REGEX, sinceMs: 60_000, nowMs });

    assert.deepEqual(entries.map((entry) => entry.runId), ["run_new", "run_recent"]);
  });

  it("ignores limit when all is true", async () => {
    const runsRoot = await tempRunsRoot();
    await makeRunDir(runsRoot, "run_1", 1_700_000_000_000);
    await makeRunDir(runsRoot, "run_2", 1_700_000_060_000);
    await makeRunDir(runsRoot, "run_3", 1_700_000_120_000);

    const entries = await listRuns({ runsRoot, runIdRegex: RUN_ID_REGEX, all: true, limit: 1 });

    assert.deepEqual(entries.map((entry) => entry.runId), ["run_3", "run_2", "run_1"]);
  });

  it("filters out directories that are not runIds", async () => {
    const runsRoot = await tempRunsRoot();
    await makeRunDir(runsRoot, "run_valid", 1_700_000_120_000);
    await makeRunDir(runsRoot, "tmp.not-a-run", 1_700_000_180_000);
    await makeRunDir(runsRoot, ".DS_Store", 1_700_000_240_000);

    const entries = await listRuns({ runsRoot, runIdRegex: RUN_ID_REGEX, all: true });

    assert.deepEqual(entries.map((entry) => entry.runId), ["run_valid"]);
  });

  it("returns an empty array when runsRoot is missing", async () => {
    const root = await tempRoot();

    const entries = await listRuns({ runsRoot: join(root, "missing"), runIdRegex: RUN_ID_REGEX });

    assert.deepEqual(entries, []);
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "run-discovery-"));
  tempRoots.push(root);
  return root;
}

async function tempRunsRoot(): Promise<string> {
  const root = await tempRoot();
  const runsRoot = join(root, "runs");
  await mkdir(runsRoot, { recursive: true });
  return runsRoot;
}

async function makeRunDir(runsRoot: string, runId: string, mtimeMs: number): Promise<void> {
  const runDir = join(runsRoot, runId);
  await mkdir(runDir, { recursive: true });
  const time = new Date(mtimeMs);
  await utimes(runDir, time, time);
}
