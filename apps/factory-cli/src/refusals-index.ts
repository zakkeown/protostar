import { appendFile } from "node:fs/promises";

export type RefusalStage = "intent" | "planning";

export const REFUSALS_INDEX_FILE_NAME = "refusals.jsonl" as const;
export const TERMINAL_STATUS_ARTIFACT_NAME = "terminal-status.json" as const;
export const REFUSAL_INDEX_SCHEMA_VERSION = "1.0.0" as const;

export interface RefusalIndexEntry {
  readonly runId: string;
  readonly timestamp: string;
  readonly stage: RefusalStage;
  readonly reason: string;
  readonly artifactPath: string;
  readonly schemaVersion: "1.0.0";
}

export interface TerminalStatusArtifact {
  readonly schemaVersion: "1.0.0";
  readonly artifact: "terminal-status.json";
  readonly runId: string;
  readonly status: "refused";
  readonly stage: RefusalStage;
  readonly reason: string;
  readonly refusalArtifact: string;
}

/**
 * Format a single refusals.jsonl line.
 *
 * Pure: no fs calls, no clock reads. The timestamp is supplied by the caller so
 * the format is deterministic and unit-testable.
 */
export function formatRefusalIndexLine(entry: RefusalIndexEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

/**
 * Append one refusal entry to the refusals.jsonl index file.
 *
 * Owned by the factory-cli package per the authority boundary: only
 * apps/factory-cli writes to .protostar/. Helpers in packages/* must remain
 * pure.
 */
export async function appendRefusalIndexEntry(
  filePath: string,
  entry: RefusalIndexEntry
): Promise<void> {
  await appendFile(filePath, formatRefusalIndexLine(entry), "utf8");
}

/**
 * Build a terminal-status.json artifact body for a refused run.
 *
 * The status and schemaVersion are pinned so callers cannot accidentally write
 * a non-refused terminal status with this helper.
 */
export function buildTerminalStatusArtifact(input: {
  readonly runId: string;
  readonly stage: RefusalStage;
  readonly reason: string;
  readonly refusalArtifact: string;
}): TerminalStatusArtifact {
  return {
    schemaVersion: REFUSAL_INDEX_SCHEMA_VERSION,
    artifact: TERMINAL_STATUS_ARTIFACT_NAME,
    runId: input.runId,
    status: "refused",
    stage: input.stage,
    reason: input.reason,
    refusalArtifact: input.refusalArtifact
  };
}
