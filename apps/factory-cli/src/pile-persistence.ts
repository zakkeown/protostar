/**
 * Phase 6 Plan 06-07 Task 2 — `writePileArtifacts`: per-pile artifact writer.
 *
 * Sole filesystem ingress for pile artifacts in factory-cli. Mirrors the
 * snapshot-writer atomic tmp+rename pattern (Q-07).
 *
 * Layout (D-07):
 *   {runRoot}/runs/{runId}/piles/{kind}/iter-{N}/{result.json,trace.json,refusal.json}
 *
 * - On `outcome.ok === true`: write result.json + trace.json (Q-08 — always
 *   persist trace).
 * - On `outcome.ok === false`: write refusal.json only; no result.json/trace.json.
 *
 * T-6-23 mitigation: target paths are resolved against the runs/ root and the
 * call refuses any runId that escapes the root via .. or absolute traversal.
 */

import { mkdir, open, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { PileRunOutcome } from "@protostar/dogpile-adapter";
import type {
  PileFailure,
  PileSourceOfTruth
} from "@protostar/dogpile-adapter";

import type { RefusalStage } from "./refusals-index.js";

export type PileArtifactKind = "planning" | "review" | "execution-coordination";

export interface PileRefusalEnvelope {
  readonly reason: string;
  readonly stage: RefusalStage;
  readonly sourceOfTruth: PileSourceOfTruth;
}

export interface WritePileArtifactsInput {
  // Provide either `runRoot` (artifacts land under `{runRoot}/runs/{runId}/piles/...`)
  // OR `runDir` (artifacts land under `{runDir}/piles/...`). `runDir` is the
  // simpler form for factory-cli where the per-run directory is already known
  // (`runDir = resolve(outDir, runId)`).
  readonly runRoot?: string;
  readonly runDir?: string;
  readonly runId: string;
  readonly kind: PileArtifactKind;
  readonly iteration: number;
  readonly outcome: PileRunOutcome;
  readonly refusal?: PileRefusalEnvelope;
}

export interface WritePileArtifactsResult {
  readonly resultPath?: string;
  readonly tracePath?: string;
  readonly refusalPath?: string;
}

interface RefusalArtifactBody {
  readonly schemaVersion: "1.0.0";
  readonly artifact: "refusal.json";
  readonly runId: string;
  readonly kind: PileArtifactKind;
  readonly iteration: number;
  readonly stage: RefusalStage;
  readonly reason: string;
  readonly sourceOfTruth: PileSourceOfTruth;
  readonly failure: PileFailure | null;
}

export async function writePileArtifacts(
  input: WritePileArtifactsInput
): Promise<WritePileArtifactsResult> {
  const dir = resolvePileIterDir(input);
  await mkdir(dir, { recursive: true });

  if (input.outcome.ok) {
    const resultPath = await writeAtomicJson(dir, "result.json", input.outcome.result);
    const tracePath = await writeAtomicJson(dir, "trace.json", input.outcome.trace);
    return { resultPath, tracePath };
  }

  if (input.refusal === undefined) {
    throw new Error(
      "writePileArtifacts: outcome.ok=false requires a refusal envelope (reason, stage, sourceOfTruth)."
    );
  }

  const body: RefusalArtifactBody = {
    schemaVersion: "1.0.0",
    artifact: "refusal.json",
    runId: input.runId,
    kind: input.kind,
    iteration: input.iteration,
    stage: input.refusal.stage,
    reason: input.refusal.reason,
    sourceOfTruth: input.refusal.sourceOfTruth,
    failure: input.outcome.failure ?? null
  };
  const refusalPath = await writeAtomicJson(dir, "refusal.json", body);
  return { refusalPath };
}

function resolvePileIterDir(input: WritePileArtifactsInput): string {
  // Prefer runDir when supplied; otherwise compute from runRoot/runs/runId.
  if (input.runDir !== undefined) {
    const target = resolve(input.runDir, "piles", input.kind, `iter-${input.iteration}`);
    if (!isPathInside(target, resolve(input.runDir))) {
      throw new Error(
        `writePileArtifacts: piles dir resolves outside runDir (T-6-23 path traversal refusal).`
      );
    }
    return target;
  }
  if (input.runRoot === undefined) {
    throw new Error("writePileArtifacts: must supply either runRoot or runDir.");
  }
  const runsRoot = resolve(input.runRoot, "runs");
  const target = resolve(runsRoot, input.runId, "piles", input.kind, `iter-${input.iteration}`);
  if (!isPathInside(target, runsRoot)) {
    throw new Error(
      `writePileArtifacts: runId "${input.runId}" resolves outside runs root (T-6-23 path traversal refusal).`
    );
  }
  return target;
}

function isPathInside(child: string, parent: string): boolean {
  const parentWithSep = parent.endsWith("/") ? parent : `${parent}/`;
  return child === parent || child.startsWith(parentWithSep);
}

async function writeAtomicJson(dir: string, fileName: string, payload: unknown): Promise<string> {
  const finalPath = join(dir, fileName);
  const tmpPath = join(dir, `${fileName}.tmp`);
  const serialized = JSON.stringify(payload, null, 2);

  await writeFile(tmpPath, serialized, "utf8");
  const fh = await open(tmpPath, "r");
  try {
    await fh.datasync();
  } finally {
    await fh.close();
  }
  await rename(tmpPath, finalPath);
  return finalPath;
}
