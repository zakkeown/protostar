import type { TaskJournalEvent } from "./journal-types.js";

export const JOURNAL_FILE_NAME = "journal.jsonl" as const;

export interface ParseJournalLinesResult {
  readonly events: readonly TaskJournalEvent[];
  readonly droppedTrailingPartial: boolean;
  readonly errors: readonly JournalLineParseError[];
}

export interface JournalLineParseError {
  readonly lineIndex: number;
  readonly message: string;
}

export function formatTaskJournalLine(event: TaskJournalEvent): string {
  assertTaskJournalEvent(event);
  return `${JSON.stringify(event)}\n`;
}

export function parseJournalLines(raw: string): ParseJournalLinesResult {
  if (raw.length === 0) {
    return { events: [], droppedTrailingPartial: false, errors: [] };
  }

  const hasTrailingNewline = raw.endsWith("\n");
  const lines = raw.split("\n");
  const candidates = hasTrailingNewline ? lines.slice(0, -1) : lines;
  const events: TaskJournalEvent[] = [];
  const errors: JournalLineParseError[] = [];
  let droppedTrailingPartial = false;

  for (let index = 0; index < candidates.length; index += 1) {
    const line = candidates[index] ?? "";
    if (line.trim() === "") {
      continue;
    }

    try {
      events.push(JSON.parse(line) as TaskJournalEvent);
    } catch (error: unknown) {
      const isTrailingPartial = index === candidates.length - 1 && !hasTrailingNewline;
      if (isTrailingPartial) {
        droppedTrailingPartial = true;
      } else {
        errors.push({ lineIndex: index, message: formatParseError(error) });
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `journal corruption: ${errors
        .map((error) => `line ${error.lineIndex}: ${error.message}`)
        .join("; ")}`
    );
  }

  return { events, droppedTrailingPartial, errors: [] };
}

function assertTaskJournalEvent(event: TaskJournalEvent): void {
  if (typeof event !== "object" || event === null) {
    throw new Error("task journal event must be an object");
  }
  if (event.schemaVersion !== "1.0.0") {
    throw new Error("task journal event schemaVersion must be 1.0.0");
  }
  for (const field of ["kind", "runId", "planTaskId", "at"] as const) {
    if (typeof event[field] !== "string" || event[field].length === 0) {
      throw new Error(`task journal event ${field} is required`);
    }
  }
  for (const field of ["attempt", "seq"] as const) {
    if (!Number.isInteger(event[field]) || event[field] < 0) {
      throw new Error(`task journal event ${field} must be a non-negative integer`);
    }
  }
}

function formatParseError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
