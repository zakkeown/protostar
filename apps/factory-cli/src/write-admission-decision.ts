import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  hashPolicySnapshot,
  signAdmissionDecision,
  type AdmissionDecisionBase,
  type GateName,
  type PolicySnapshot,
  type PrecedenceDecision
} from "@protostar/authority";

import {
  ADMISSION_DECISION_INDEX_SCHEMA_VERSION,
  ADMISSION_DECISIONS_INDEX_FILE_NAME,
  appendAdmissionDecisionIndexEntry
} from "./admission-decisions-index.js";

export interface WriteAdmissionDecisionInput<E extends object> {
  readonly runDir: string;
  readonly gate: GateName;
  readonly decision: AdmissionDecisionBase<E>;
  readonly signed?: boolean;
}

export async function writeAdmissionDecision<E extends object>(
  input: WriteAdmissionDecisionInput<E>
): Promise<{ artifactPath: string }> {
  const artifactPath = join(input.runDir, `${input.gate}-admission-decision.json`);
  const payload = input.signed === true ? signAdmissionDecision(input.decision) : input.decision;

  await mkdir(input.runDir, { recursive: true });
  await writeJson(artifactPath, payload);
  await appendAdmissionDecisionIndexEntry(join(input.runDir, ADMISSION_DECISIONS_INDEX_FILE_NAME), {
    runId: input.decision.runId,
    timestamp: input.decision.timestamp,
    gate: input.gate,
    outcome: input.decision.outcome,
    artifactPath,
    schemaVersion: ADMISSION_DECISION_INDEX_SCHEMA_VERSION,
    precedenceStatus: input.decision.precedenceResolution.status
  });

  return { artifactPath };
}

export async function writePrecedenceDecision(input: {
  readonly runDir: string;
  readonly decision: PrecedenceDecision;
}): Promise<{ artifactPath: string } | null> {
  if (input.decision.status === "no-conflict") {
    return null;
  }

  const artifactPath = join(input.runDir, "precedence-decision.json");
  await mkdir(input.runDir, { recursive: true });
  await writeJson(artifactPath, input.decision);
  return { artifactPath };
}

export async function writePolicySnapshot(input: {
  readonly runDir: string;
  readonly snapshot: PolicySnapshot;
}): Promise<{ artifactPath: string; hash: string }> {
  const artifactPath = join(input.runDir, "policy-snapshot.json");
  await mkdir(input.runDir, { recursive: true });
  await writeJson(artifactPath, input.snapshot);
  return { artifactPath, hash: hashPolicySnapshot(input.snapshot) };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
