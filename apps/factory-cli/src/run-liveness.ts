import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { FactoryRunManifest, FactoryRunStatus } from "@protostar/artifacts";

export type RunLivenessState = "live" | "orphaned" | "unknown";
export type RunLivenessComputedState = RunLivenessState | FactoryRunStatus;

export interface RunLiveness {
  readonly state: RunLivenessComputedState;
  readonly lastJournalAt: number | null;
  readonly hasSentinel: boolean;
  readonly manifestStatus: FactoryRunStatus | null;
  readonly error?: string;
}

export interface ComputeRunLivenessOptions {
  readonly runDir: string;
  readonly thresholdMs: number;
  readonly nowMs?: number;
}

const TERMINAL_STATUSES = new Set<FactoryRunStatus>(["completed", "blocked", "cancelled"]);

export function computeRunLiveness(opts: ComputeRunLivenessOptions): Promise<RunLiveness> {
  return computeRunLivenessInner(opts);
}

async function computeRunLivenessInner(opts: ComputeRunLivenessOptions): Promise<RunLiveness> {
  const hasSentinel = await fileExists(join(opts.runDir, "CANCEL"));

  let manifest: FactoryRunManifest;
  try {
    const raw = await readFile(join(opts.runDir, "manifest.json"), "utf8");
    manifest = JSON.parse(raw) as FactoryRunManifest;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      state: "unknown",
      lastJournalAt: null,
      hasSentinel,
      manifestStatus: null,
      error: `failed to read manifest.json: ${message}`
    };
  }

  const lastJournalAt = await journalMtimeMs(join(opts.runDir, "execution", "journal.jsonl"));

  if (TERMINAL_STATUSES.has(manifest.status)) {
    return {
      state: manifest.status,
      lastJournalAt,
      hasSentinel,
      manifestStatus: manifest.status
    };
  }

  const nowMs = opts.nowMs ?? Date.now();
  if (
    manifest.status === "running" &&
    nowMs - (lastJournalAt ?? 0) > opts.thresholdMs &&
    !hasSentinel
  ) {
    return {
      state: 'orphaned',
      lastJournalAt,
      hasSentinel,
      manifestStatus: manifest.status
    };
  }

  return {
    state: "live",
    lastJournalAt,
    hasSentinel,
    manifestStatus: manifest.status
  };
}

async function journalMtimeMs(journalPath: string): Promise<number | null> {
  try {
    return (await stat(journalPath)).mtimeMs;
  } catch (error: unknown) {
    if (isNodeErrno(error) && error.code === "ENOENT") {
      return null;
    }
    return null;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isNodeErrno(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
