import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface CalibrationEntry {
  readonly runId: string;
  readonly lineageId: string;
  readonly generation: number;
  readonly similarity?: number;
  readonly threshold: number;
  readonly evolutionAction: "continue" | "converged" | "exhausted";
  readonly timestamp: string;
}

export const CALIBRATION_LOG_PATH = ".protostar/calibration/ontology-similarity.jsonl" as const;

export async function appendCalibrationEntry(filePath: string, entry: CalibrationEntry): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}
