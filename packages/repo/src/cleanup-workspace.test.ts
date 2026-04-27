import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import { cleanupWorkspace } from "./cleanup-workspace.js";

describe("cleanupWorkspace", () => {
  it("removes the workspace dir on success", async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "protostar-cleanup-success-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    await writeFile(join(dir, "artifact.txt"), "kept until cleanup\n", "utf8");

    const result = await cleanupWorkspace(dir, "run-1", { reason: "success" });

    assert.deepEqual(result, { removed: true });
    assert.equal(existsSync(dir), false);
  });

  it("is idempotent when success cleanup sees an absent dir", async (t) => {
    const parent = await mkdtemp(join(tmpdir(), "protostar-cleanup-absent-"));
    t.after(() => rm(parent, { recursive: true, force: true }));
    const dir = join(parent, "missing-workspace");

    const result = await cleanupWorkspace(dir, "run-1", { reason: "success" });

    assert.deepEqual(result, { removed: true });
  });

  it("retains the workspace and writes failure tombstone metadata", async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "protostar-cleanup-failure-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    await writeFile(join(dir, "artifact.txt"), "retained\n", "utf8");

    const result = await cleanupWorkspace(dir, "run-2", {
      reason: "failure",
      tombstoneRetentionHours: 24,
      errorMessage: "boom"
    });

    assert.equal(result.removed, false);
    assert.equal(result.tombstonePath, join(dir, "tombstone.json"));
    assert.equal(existsSync(dir), true);
    const tombstone = parseTombstone(await readFile(join(dir, "tombstone.json"), "utf8"));
    assert.equal(tombstone.runId, "run-2");
    assert.equal(tombstone.reason, "failure");
    assert.equal(tombstone.errorMessage, "boom");
    assertRetentionDelta(tombstone, 24);
  });

  it("uses the default 24h retention on failure", async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "protostar-cleanup-default-"));
    t.after(() => rm(dir, { recursive: true, force: true }));

    await cleanupWorkspace(dir, "run-default", { reason: "failure" });

    const tombstone = parseTombstone(await readFile(join(dir, "tombstone.json"), "utf8"));
    assertRetentionDelta(tombstone, 24);
  });

  it("honors custom failure retention", async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "protostar-cleanup-custom-"));
    t.after(() => rm(dir, { recursive: true, force: true }));

    await cleanupWorkspace(dir, "run-custom", {
      reason: "failure",
      tombstoneRetentionHours: 1
    });

    const tombstone = parseTombstone(await readFile(join(dir, "tombstone.json"), "utf8"));
    assertRetentionDelta(tombstone, 1);
  });
});

interface TombstoneLike {
  readonly runId: unknown;
  readonly failedAt: string;
  readonly retentionExpiresAt: string;
  readonly reason: unknown;
  readonly errorMessage?: unknown;
}

function parseTombstone(raw: string): TombstoneLike {
  return JSON.parse(raw) as TombstoneLike;
}

function assertRetentionDelta(record: TombstoneLike, hours: number): void {
  assert.match(record.failedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(record.retentionExpiresAt, /^\d{4}-\d{2}-\d{2}T/);
  const deltaMs = Date.parse(record.retentionExpiresAt) - Date.parse(record.failedAt);
  assert.ok(
    Math.abs(deltaMs - hours * 3600 * 1000) < 1000,
    `expected retention delta ${hours}h, got ${deltaMs}ms`
  );
}
