import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TaskJournalEvent } from "./journal-types.js";
import { formatTaskJournalLine, parseJournalLines } from "./journal.js";

describe("journal formatter and parser", () => {
  it("formats a task journal event as one JSON line", () => {
    const event = taskEvent({ kind: "task-pending", seq: 1 });

    const line = formatTaskJournalLine(event);

    assert.equal(line.endsWith("\n"), true);
    assert.deepEqual(JSON.parse(line) as TaskJournalEvent, event);
  });

  it("parses complete newline-terminated journal lines", () => {
    const first = taskEvent({ kind: "task-pending", seq: 1 });
    const second = taskEvent({ kind: "task-running", seq: 2 });

    const parsed = parseJournalLines(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);

    assert.deepEqual(parsed, {
      events: [first, second],
      droppedTrailingPartial: false,
      errors: []
    });
  });

  it("drops only a malformed trailing partial line", () => {
    const event = taskEvent({ kind: "task-pending", seq: 1 });

    const parsed = parseJournalLines(`${JSON.stringify(event)}\n{"kind":`);

    assert.deepEqual(parsed, {
      events: [event],
      droppedTrailingPartial: true,
      errors: []
    });
  });

  it("throws loud on mid-stream journal corruption", () => {
    const first = taskEvent({ kind: "task-pending", seq: 1 });
    const third = taskEvent({ kind: "task-running", seq: 3 });

    assert.throws(
      () => parseJournalLines(`${JSON.stringify(first)}\n{not-json}\n${JSON.stringify(third)}\n`),
      /journal corruption: line 1:/
    );
  });

  it("parses empty input as an empty journal", () => {
    assert.deepEqual(parseJournalLines(""), {
      events: [],
      droppedTrailingPartial: false,
      errors: []
    });
  });

  it("treats a trailing newline-only input as blank, not partial", () => {
    assert.deepEqual(parseJournalLines("\n"), {
      events: [],
      droppedTrailingPartial: false,
      errors: []
    });
  });
});

function taskEvent(
  variant: Pick<TaskJournalEvent, "kind" | "seq"> & Partial<TaskJournalEvent>
): TaskJournalEvent {
  return {
    schemaVersion: "1.0.0",
    runId: "r1",
    planTaskId: "t1",
    at: "2026-04-27T00:00:00.000Z",
    attempt: 1,
    ...variant
  } as TaskJournalEvent;
}
