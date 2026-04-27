import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

import { JOURNAL_FILE_NAME, parseJournalLines, type TaskJournalEvent } from "@protostar/execution";

import { createJournalWriter } from "./journal-writer.js";

describe("createJournalWriter", () => {
  it("writes one formatted journal line under runDir/execution", async () => {
    await withRunDir(async (runDir) => {
      const writer = await createJournalWriter({ runDir });
      await writer.appendEvent(taskEvent({ kind: "task-pending", seq: 1 }));
      await writer.close();

      const raw = await readFile(journalPath(runDir), "utf8");
      const parsed = parseJournalLines(raw);
      assert.equal(raw.endsWith("\n"), true);
      assert.equal(parsed.events.length, 1);
      assert.equal(parsed.events[0]?.kind, "task-pending");
    });
  });

  it("appends two events as two whole newline-separated lines", async () => {
    await withRunDir(async (runDir) => {
      const writer = await createJournalWriter({ runDir });
      await writer.appendEvent(taskEvent({ kind: "task-pending", seq: 1 }));
      await writer.appendEvent(taskEvent({ kind: "task-running", seq: 2 }));
      await writer.close();

      const lines = (await readFile(journalPath(runDir), "utf8"))
        .split("\n")
        .filter((line) => line.length > 0);
      assert.equal(lines.length, 2);
      assert.equal((JSON.parse(lines[0] ?? "{}") as TaskJournalEvent).kind, "task-pending");
      assert.equal((JSON.parse(lines[1] ?? "{}") as TaskJournalEvent).kind, "task-running");
    });
  });

  it("flushes before appendEvent resolves so a separate read sees the line", async () => {
    await withRunDir(async (runDir) => {
      const writer = await createJournalWriter({ runDir });
      const event = taskEvent({ kind: "task-pending", seq: 1 });

      await writer.appendEvent(event);

      assert.deepEqual(parseJournalLines(await readFile(journalPath(runDir), "utf8")).events, [event]);
      await writer.close();
    });
  });

  it("serializes concurrent appends without interleaved partial lines", async () => {
    await withRunDir(async (runDir) => {
      const writer = await createJournalWriter({ runDir });

      await Promise.all([
        writer.appendEvent(taskEvent({ kind: "task-pending", seq: 1 })),
        writer.appendEvent(taskEvent({ kind: "task-running", seq: 2 }))
      ]);
      await writer.close();

      const parsed = parseJournalLines(await readFile(journalPath(runDir), "utf8"));
      assert.deepEqual(
        parsed.events.map((event) => event.seq).sort((left, right) => left - right),
        [1, 2]
      );
    });
  });

  it("close releases the file handle", async () => {
    await withRunDir(async (runDir) => {
      const writer = await createJournalWriter({ runDir });
      await writer.appendEvent(taskEvent({ kind: "task-pending", seq: 1 }));
      await writer.close();

      const handle = await open(journalPath(runDir), "a");
      await handle.close();
    });
  });
});

async function withRunDir(run: (runDir: string) => Promise<void>): Promise<void> {
  const runDir = await mkdtemp(resolve(tmpdir(), "journal-writer-test-"));
  try {
    await run(runDir);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}

function journalPath(runDir: string): string {
  return join(runDir, "execution", JOURNAL_FILE_NAME);
}

function taskEvent(variant: Partial<TaskJournalEvent> & Pick<TaskJournalEvent, "kind" | "seq">): TaskJournalEvent {
  return {
    schemaVersion: "1.0.0",
    runId: "run_1",
    planTaskId: "t1",
    at: "2026-04-27T00:00:00.000Z",
    attempt: 1,
    ...variant
  } as TaskJournalEvent;
}
