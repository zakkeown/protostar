import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { AdmissionDecisionOutcome, GateName, PrecedenceDecision } from "@protostar/authority";

export const ADMISSION_DECISIONS_INDEX_FILE_NAME = "admission-decisions.jsonl" as const;
export const ADMISSION_DECISION_INDEX_SCHEMA_VERSION = "1.0.0" as const;

export interface AdmissionDecisionIndexEntry {
  readonly runId: string;
  readonly timestamp: string;
  readonly gate: GateName;
  readonly outcome: AdmissionDecisionOutcome;
  readonly artifactPath: string;
  readonly schemaVersion: "1.0.0";
  readonly precedenceStatus: PrecedenceDecision["status"];
}

export function formatAdmissionDecisionIndexLine(entry: AdmissionDecisionIndexEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

export async function appendAdmissionDecisionIndexEntry(
  jsonlPath: string,
  entry: AdmissionDecisionIndexEntry
): Promise<void> {
  await mkdir(dirname(jsonlPath), { recursive: true });
  await appendFile(jsonlPath, formatAdmissionDecisionIndexLine(entry), "utf8");
}
