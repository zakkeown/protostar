import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import {
  SNAPSHOT_FILE_NAME,
  serializeSnapshot,
  type ExecutionSnapshot
} from "@protostar/execution";

import { writeSnapshotAtomic } from "./snapshot-writer.js";

describe("writeSnapshotAtomic", () => {
  it("writes canonical snapshot bytes under runDir/execution", async () => {
    await withRunDir(async (runDir) => {
      const snapshot = executionSnapshot({ generatedAt: "2026-04-27T00:00:00.000Z" });

      await writeSnapshotAtomic({ runDir, snapshot });

      assert.equal(await readFile(snapshotPath(runDir), "utf8"), serializeSnapshot(snapshot));
    });
  });

  it("does not leave snapshot.json.tmp after a successful rename", async () => {
    await withRunDir(async (runDir) => {
      await writeSnapshotAtomic({
        runDir,
        snapshot: executionSnapshot({ generatedAt: "2026-04-27T00:00:00.000Z" })
      });

      await assert.rejects(stat(join(runDir, "execution", `${SNAPSHOT_FILE_NAME}.tmp`)), {
        code: "ENOENT"
      });
    });
  });

  it("keeps snapshot.json parseable across concurrent writes", async () => {
    await withRunDir(async (runDir) => {
      await writeSnapshotAtomic({
        runDir,
        snapshot: executionSnapshot({ generatedAt: "2026-04-27T00:00:00.000Z", lastEventSeq: 1 })
      });

      await Promise.all([
        writeSnapshotAtomic({
          runDir,
          snapshot: executionSnapshot({ generatedAt: "2026-04-27T00:00:01.000Z", lastEventSeq: 2 })
        }),
        writeSnapshotAtomic({
          runDir,
          snapshot: executionSnapshot({ generatedAt: "2026-04-27T00:00:02.000Z", lastEventSeq: 3 })
        })
      ]);

      const finalRaw = await readFile(snapshotPath(runDir), "utf8");
      const finalSnapshot = JSON.parse(finalRaw) as ExecutionSnapshot;
      assert.ok(finalSnapshot.lastEventSeq === 2 || finalSnapshot.lastEventSeq === 3);
      assert.doesNotThrow(() => JSON.parse(finalRaw));
    });
  });

  it("uses source-pinned tmp rename and fsync calls", async () => {
    const source = await readFile(join(process.cwd(), "apps/factory-cli/src/snapshot-writer.ts"), "utf8");

    assert.match(source, /rename\(/);
    assert.match(source, /datasync|sync/);
    assert.match(source, /snapshot\.json\.tmp|\`\$\{SNAPSHOT_FILE_NAME\}\.tmp\`/);
  });
});

async function withRunDir(run: (runDir: string) => Promise<void>): Promise<void> {
  const runDir = await mkdtemp(resolve(tmpdir(), "snapshot-writer-test-"));
  try {
    await run(runDir);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}

function snapshotPath(runDir: string): string {
  return join(runDir, "execution", SNAPSHOT_FILE_NAME);
}

function executionSnapshot(input: {
  readonly generatedAt: string;
  readonly lastEventSeq?: number;
}): ExecutionSnapshot {
  return {
    schemaVersion: "1.0.0",
    runId: "run_1",
    generatedAt: input.generatedAt,
    lastEventSeq: input.lastEventSeq ?? 1,
    tasks: {
      t1: {
        status: "running",
        attempt: 1,
        lastTransitionAt: input.generatedAt
      }
    }
  };
}
