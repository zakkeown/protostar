import { constants as fsConstants } from "node:fs";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import {
  formatStressEventLine,
  formatStressReport,
  parseStressEvent,
  parseStressReport,
  type StressEvent,
  type StressOutcome,
  type StressReport,
  type StressShape
} from "@protostar/artifacts";

import type { StressCapBreach, StressCapSource } from "./stress-caps.js";
import type { StressWedgeEvidence } from "./wedge-detection.js";

export type StressCursorStatus = "running" | "completed" | "aborted" | "cancelled";

export interface StressSessionPaths {
  readonly stressRoot: string;
  readonly sessionDir: string;
  readonly cursorPath: string;
  readonly eventsPath: string;
  readonly reportPath: string;
  readonly capBreachPath: string;
  readonly wedgeEvidencePath: string;
  readonly inputsDir: string;
}

export interface StressCursorRun {
  readonly runId: string;
  readonly seedId: string;
  readonly archetype: string;
  readonly outcome: StressOutcome;
  readonly durationMs: number;
  readonly prUrl?: string;
  readonly ciVerdict?: "success" | "failure" | "timeout" | "skipped";
  readonly faultInjected?: string;
}

export interface StressCursor {
  readonly sessionId: string;
  readonly shape: StressShape;
  readonly status: StressCursorStatus;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly completed: number;
  readonly runs: readonly StressCursorRun[];
}

export interface CapBreachArtifact {
  readonly schemaVersion: "protostar.stress.cap-breach.v1";
  readonly sessionId: string;
  readonly detectedAt: string;
  readonly capSource: StressCapSource;
  readonly breach: StressCapBreach;
}

export interface WedgeEvidenceArtifact extends StressWedgeEvidence {
  readonly schemaVersion: "protostar.stress.wedge-evidence.v1";
  readonly sessionId: string;
}

const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const writeChains = new Map<string, Promise<void>>();

export function resolveStressSessionPaths(workspaceRoot: string, sessionId: string): StressSessionPaths {
  if (!SESSION_ID_REGEX.test(sessionId)) {
    throw new Error(`sessionId must match ${SESSION_ID_REGEX.toString()}`);
  }

  const stressRoot = resolve(workspaceRoot, ".protostar", "stress");
  const sessionDir = resolve(stressRoot, sessionId);
  if (!sessionDir.startsWith(`${stressRoot}${sep}`)) {
    throw new Error("sessionId resolves outside .protostar/stress");
  }

  return {
    stressRoot,
    sessionDir,
    cursorPath: join(sessionDir, "cursor.json"),
    eventsPath: join(sessionDir, "events.jsonl"),
    reportPath: join(sessionDir, "stress-report.json"),
    capBreachPath: join(sessionDir, "phase-11-cap-breach.json"),
    wedgeEvidencePath: join(sessionDir, "wedge-evidence.json"),
    inputsDir: join(sessionDir, "inputs")
  };
}

export async function beginStressSession(input: {
  readonly paths: StressSessionPaths;
  readonly shape: StressShape;
  readonly startedAt?: string;
}): Promise<StressCursor> {
  await mkdir(input.paths.sessionDir, { recursive: true });
  const existing = await readCursorIfExists(input.paths.cursorPath);
  if (existing !== null) {
    return existing;
  }

  const cursor = parseStressCursor({
    sessionId: sessionIdFromPaths(input.paths),
    shape: input.shape,
    status: "running",
    startedAt: input.startedAt ?? new Date().toISOString(),
    completed: 0,
    runs: []
  });
  await writeCursorAtomic(input.paths.cursorPath, cursor);
  return cursor;
}

export async function appendStressEvent(input: {
  readonly paths: StressSessionPaths;
  readonly at?: string;
  readonly type: string;
  readonly payload: StressEvent["payload"];
}): Promise<StressEvent> {
  const previous = writeChains.get(input.paths.eventsPath) ?? Promise.resolve();
  let appended: StressEvent | null = null;
  const next = previous.then(async () => {
    await mkdir(dirname(input.paths.eventsPath), { recursive: true });
    const sequence = await nextEventSequence(input.paths.eventsPath);
    const event = parseStressEvent({
      sessionId: sessionIdFromPaths(input.paths),
      sequence,
      at: input.at ?? new Date().toISOString(),
      type: input.type,
      payload: input.payload
    });
    const handle = await open(input.paths.eventsPath, fsConstants.O_APPEND | fsConstants.O_CREAT | fsConstants.O_WRONLY, 0o666);
    try {
      await handle.appendFile(formatStressEventLine(event), "utf8");
      await handle.datasync();
    } finally {
      await handle.close();
    }
    appended = event;
  });
  writeChains.set(
    input.paths.eventsPath,
    next.finally(() => {
      if (writeChains.get(input.paths.eventsPath) === next) {
        writeChains.delete(input.paths.eventsPath);
      }
    })
  );
  await next;
  if (appended === null) {
    throw new Error("failed to append stress event");
  }
  return appended;
}

export async function recordStressRun(input: {
  readonly paths: StressSessionPaths;
  readonly run: StressCursorRun;
}): Promise<StressCursor> {
  const cursor = await readStressCursor(input.paths.cursorPath);
  const nextCursor = parseStressCursor({
    ...cursor,
    completed: cursor.runs.length + 1,
    runs: [...cursor.runs, input.run]
  });
  await writeCursorAtomic(input.paths.cursorPath, nextCursor);
  return nextCursor;
}

export async function finalizeStressSession(input: {
  readonly paths: StressSessionPaths;
  readonly headlessMode: string;
  readonly llmBackend: string;
  readonly finishedAt?: string;
}): Promise<StressReport> {
  const cursor = await readStressCursor(input.paths.cursorPath);
  const finishedAt = input.finishedAt ?? new Date().toISOString();
  const report = parseStressReport({
    sessionId: cursor.sessionId,
    startedAt: cursor.startedAt,
    finishedAt,
    totalRuns: cursor.runs.length,
    headlessMode: input.headlessMode,
    llmBackend: input.llmBackend,
    shape: cursor.shape,
    perArchetype: buildPerArchetype(cursor.runs),
    perRun: cursor.runs
  });
  await writeStressReportAtomic({ paths: input.paths, report });
  await writeCursorAtomic(input.paths.cursorPath, parseStressCursor({
    ...cursor,
    status: "completed",
    finishedAt,
    completed: cursor.runs.length
  }));
  return report;
}

export async function writeStressReportAtomic(input: {
  readonly paths: StressSessionPaths;
  readonly report: StressReport;
}): Promise<void> {
  await writeTextAtomic(input.paths.reportPath, formatStressReport(input.report));
}

export async function writeCapBreach(input: {
  readonly paths: StressSessionPaths;
  readonly breach: StressCapBreach;
  readonly capSource: StressCapSource;
  readonly detectedAt?: string;
}): Promise<CapBreachArtifact> {
  const artifact: CapBreachArtifact = {
    schemaVersion: "protostar.stress.cap-breach.v1",
    sessionId: sessionIdFromPaths(input.paths),
    detectedAt: input.detectedAt ?? new Date().toISOString(),
    capSource: input.capSource,
    breach: input.breach
  };
  await writeTextAtomic(input.paths.capBreachPath, `${JSON.stringify(sortObject(artifact))}\n`);
  return artifact;
}

export async function writeWedgeEvidence(input: {
  readonly paths: StressSessionPaths;
  readonly evidence: StressWedgeEvidence;
}): Promise<WedgeEvidenceArtifact> {
  const artifact: WedgeEvidenceArtifact = {
    ...input.evidence,
    schemaVersion: "protostar.stress.wedge-evidence.v1",
    sessionId: input.evidence.sessionId ?? sessionIdFromPaths(input.paths)
  };
  await writeTextAtomic(input.paths.wedgeEvidencePath, `${JSON.stringify(sortObject(artifact))}\n`);
  return artifact;
}

export async function readStressCursor(cursorPath: string): Promise<StressCursor> {
  return parseStressCursor(JSON.parse(await readFile(cursorPath, "utf8")));
}

async function writeCursorAtomic(cursorPath: string, cursor: StressCursor): Promise<void> {
  await writeTextAtomic(cursorPath, `${JSON.stringify(sortObject(parseStressCursor(cursor)))}\n`);
}

async function readCursorIfExists(cursorPath: string): Promise<StressCursor | null> {
  try {
    return await readStressCursor(cursorPath);
  } catch (error: unknown) {
    if (isNodeErrno(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeTextAtomic(finalPath: string, content: string): Promise<void> {
  const previous = writeChains.get(finalPath) ?? Promise.resolve();
  const next = previous.then(() => writeTextAtomicUnchained(finalPath, content));
  writeChains.set(
    finalPath,
    next.finally(() => {
      if (writeChains.get(finalPath) === next) {
        writeChains.delete(finalPath);
      }
    })
  );
  return next;
}

async function writeTextAtomicUnchained(finalPath: string, content: string): Promise<void> {
  const dir = dirname(finalPath);
  await mkdir(dir, { recursive: true });
  const tmpPath = `${finalPath}.tmp`;
  await writeFile(tmpPath, content, "utf8");
  const fileHandle = await open(tmpPath, "r");
  try {
    await fileHandle.datasync();
  } finally {
    await fileHandle.close();
  }
  await rename(tmpPath, finalPath);
  const dirHandle = await open(dir, "r");
  try {
    await dirHandle.datasync();
  } catch {
    // Directory fsync is best-effort across supported local filesystems.
  } finally {
    await dirHandle.close();
  }
}

async function nextEventSequence(eventsPath: string): Promise<number> {
  let content = "";
  try {
    content = await readFile(eventsPath, "utf8");
  } catch (error: unknown) {
    if (isNodeErrno(error) && error.code === "ENOENT") {
      return 1;
    }
    throw error;
  }

  const sequences = content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => parseStressEvent(JSON.parse(line)).sequence);
  return (Math.max(0, ...sequences) + 1);
}

function buildPerArchetype(runs: readonly StressCursorRun[]): StressReport["perArchetype"] {
  const archetypes = [...new Set(runs.map((run) => run.archetype))].sort();
  return archetypes.map((archetype) => {
    const matching = runs.filter((run) => run.archetype === archetype);
    const passes = matching.filter((run) => run.outcome === "pass").length;
    const threshold = thresholdForArchetype(archetype);
    const passRate = matching.length === 0 ? 0 : passes / matching.length;
    return {
      archetype,
      runs: matching.length,
      passes,
      passRate,
      threshold,
      met: passRate >= threshold
    };
  });
}

function thresholdForArchetype(archetype: string): number {
  if (archetype === "cosmetic-tweak") return 0.8;
  if (archetype === "feature-add") return 0.5;
  return 0.3;
}

function parseStressCursor(input: unknown): StressCursor {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("stress cursor must be an object");
  }
  const record = input as Record<string, unknown>;
  const sessionId = stringField(record, "sessionId");
  const shape = stringField(record, "shape") as StressShape;
  if (shape !== "sustained-load" && shape !== "concurrency" && shape !== "fault-injection") {
    throw new Error("stress cursor shape is invalid");
  }
  const status = stringField(record, "status") as StressCursorStatus;
  if (status !== "running" && status !== "completed" && status !== "aborted" && status !== "cancelled") {
    throw new Error("stress cursor status is invalid");
  }
  const startedAt = stringField(record, "startedAt");
  const finishedAt = typeof record["finishedAt"] === "string" ? record["finishedAt"] : undefined;
  const completed = numberField(record, "completed");
  const rawRuns = record["runs"];
  if (!Array.isArray(rawRuns)) {
    throw new Error("stress cursor runs must be an array");
  }
  const runs = rawRuns.map(parseStressCursorRun);
  return {
    sessionId,
    shape,
    status,
    startedAt,
    ...(finishedAt !== undefined ? { finishedAt } : {}),
    completed,
    runs
  };
}

function parseStressCursorRun(input: unknown): StressCursorRun {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("stress cursor run must be an object");
  }
  const record = input as Record<string, unknown>;
  const run: StressCursorRun = {
    runId: stringField(record, "runId"),
    seedId: stringField(record, "seedId"),
    archetype: stringField(record, "archetype"),
    outcome: stringField(record, "outcome") as StressOutcome,
    durationMs: numberField(record, "durationMs")
  };
  if (typeof record["prUrl"] === "string") Object.assign(run, { prUrl: record["prUrl"] });
  if (typeof record["ciVerdict"] === "string") Object.assign(run, { ciVerdict: record["ciVerdict"] });
  if (typeof record["faultInjected"] === "string") Object.assign(run, { faultInjected: record["faultInjected"] });
  return run;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`stress cursor ${key} must be a non-empty string`);
  }
  return value;
}

function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`stress cursor ${key} must be a finite number`);
  }
  return value;
}

function sessionIdFromPaths(paths: StressSessionPaths): string {
  return paths.sessionDir.slice(paths.stressRoot.length + 1);
}

function sortObject(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(sortObject);
  }
  if (typeof input === "object" && input !== null) {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .filter(([, value]) => value !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, sortObject(value)])
    );
  }
  return input;
}

function isNodeErrno(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
