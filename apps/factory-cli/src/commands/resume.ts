import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { Command } from "@commander-js/extra-typings";
import type { FactoryRunManifest } from "@protostar/artifacts";
import {
  JOURNAL_FILE_NAME,
  parseJournalLines,
  reduceJournalToSnapshot,
  replayOrphanedTasks,
  type TaskJournalEvent
} from "@protostar/execution";
import { resolveWorkspaceRoot } from "@protostar/paths";

import { installCancelWiring } from "../cancel.js";
import { ExitCode, type ExitCodeValue } from "../exit-codes.js";
import { writeStderr, writeStdoutJson } from "../io.js";
import { computeRunLiveness } from "../run-liveness.js";
import { assertRunIdConfined, parseRunId, type RunId } from "../run-id.js";

export interface ResumeRealExecutionInput {
  readonly runId: RunId;
  readonly runDir: string;
  readonly manifest: FactoryRunManifest;
  readonly orphanSet: readonly TaskJournalEvent[];
}

export interface ResumeReviewLoopInput {
  readonly runId: RunId;
  readonly runDir: string;
  readonly manifest: FactoryRunManifest;
  readonly startIter: number;
}

export interface ResumeCommandDependencies {
  readonly resumeRealExecution: (input: ResumeRealExecutionInput) => Promise<ExitCodeValue | number>;
  readonly resumeReviewLoop: (input: ResumeReviewLoopInput) => Promise<ExitCodeValue | number>;
}

const defaultDependencies: ResumeCommandDependencies = {
  async resumeRealExecution(input) {
    writeStderr(
      `real mid-execution resume is not wired for ${input.orphanSet.length} orphaned task(s); refusing false-success resume`
    );
    return ExitCode.NotResumable;
  },
  async resumeReviewLoop(input) {
    writeStderr(`real mid-review resume is not wired for review iter-${input.startIter}; refusing false-success resume`);
    return ExitCode.NotResumable;
  }
};

export function buildResumeCommand(deps: ResumeCommandDependencies = defaultDependencies): Command {
  const command = new Command("resume")
    .description("Resume a resumable factory run from durable run artifacts")
    .argument("<runId>", "run id to resume")
    .exitOverride()
    .configureOutput({
      writeOut: (str) => process.stderr.write(str),
      writeErr: (str) => process.stderr.write(str)
    })
    .action(async (runId) => {
      process.exitCode = await executeResume(runId, deps);
    });
  return command as unknown as Command;
}

async function executeResume(runIdInput: string, deps: ResumeCommandDependencies): Promise<number> {
  const parsedRunId = parseRunId(runIdInput);
  if (!parsedRunId.ok) {
    writeStderr(parsedRunId.reason);
    return ExitCode.UsageOrArgError;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  const runsRoot = join(workspaceRoot, ".protostar", "runs");
  try {
    assertRunIdConfined(runsRoot, parsedRunId.value);
  } catch (error: unknown) {
    writeStderr(error instanceof Error ? error.message : String(error));
    return ExitCode.UsageOrArgError;
  }

  const runDir = resolve(runsRoot, parsedRunId.value);
  const manifestResult = await readManifest(join(runDir, "manifest.json"));
  if (!manifestResult.ok) {
    writeStderr(`no manifest at ${runDir}`);
    return ExitCode.NotFound;
  }

  const manifest = manifestResult.value;
  if (manifest.status === 'cancelled') {
    writeStdoutJson({
      runId: parsedRunId.value,
      error: 'operator-cancelled-terminal'
    });
    return ExitCode.Conflict;
  }

  const liveness = await computeRunLiveness({ runDir, thresholdMs: 60_000 });
  if (liveness.hasSentinel) {
    writeStderr("clearing transient cancel sentinel before resume");
    const cancel = installCancelWiring({ runDir });
    try {
      await cancel.unlinkSentinelOnResume();
    } finally {
      cancel.dispose();
    }
  }

  switch (manifest.status) {
    case "running":
    case "orphaned":
      return resumeMidExecution({ runId: parsedRunId.value, runDir, manifest, deps });
    case "repairing":
      return resumeMidReview({ runId: parsedRunId.value, runDir, manifest, deps });
    case "ready-to-release":
      writeStderr("run is ready-to-release; use `protostar-factory deliver` instead");
      return ExitCode.NotResumable;
    case "completed":
    case "blocked":
      writeStderr(`manifest.status=${manifest.status} is terminal`);
      return ExitCode.NotResumable;
    case "created":
    case "cancelling":
      writeStderr(`manifest.status=${manifest.status} is not resumable in v0.1`);
      return ExitCode.NotResumable;
  }
}

async function resumeMidExecution(input: {
  readonly runId: RunId;
  readonly runDir: string;
  readonly manifest: FactoryRunManifest;
  readonly deps: ResumeCommandDependencies;
}): Promise<number> {
  const events = await readJournalEvents(input.runDir);
  const generatedAt = new Date().toISOString();
  const snapshot = reduceJournalToSnapshot({
    runId: input.runId,
    generatedAt,
    events
  });
  const orphanSet = replayOrphanedTasks({
    runId: input.runId,
    events,
    nowIso: generatedAt,
    nextSeq: snapshot.lastEventSeq + 1
  });

  if (orphanSet.length === 0) {
    writeStderr("nothing to replay; run appears to have completed all tasks");
    return ExitCode.Success;
  }

  return input.deps.resumeRealExecution({
    runId: input.runId,
    runDir: input.runDir,
    manifest: input.manifest,
    orphanSet
  });
}

async function resumeMidReview(input: {
  readonly runId: RunId;
  readonly runDir: string;
  readonly manifest: FactoryRunManifest;
  readonly deps: ResumeCommandDependencies;
}): Promise<number> {
  const startIter = (await highestIter(join(input.runDir, "piles", "review"))) + 1;
  return input.deps.resumeReviewLoop({
    runId: input.runId,
    runDir: input.runDir,
    manifest: input.manifest,
    startIter
  });
}

async function readManifest(
  manifestPath: string
): Promise<{ readonly ok: true; readonly value: FactoryRunManifest } | { readonly ok: false }> {
  try {
    return { ok: true, value: JSON.parse(await readFile(manifestPath, "utf8")) as FactoryRunManifest };
  } catch {
    return { ok: false };
  }
}

async function readJournalEvents(runDir: string): Promise<readonly TaskJournalEvent[]> {
  try {
    const raw = await readFile(join(runDir, "execution", JOURNAL_FILE_NAME), "utf8");
    return parseJournalLines(raw).events;
  } catch (error: unknown) {
    if (isNodeErrno(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function highestIter(reviewPileDir: string): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(reviewPileDir);
  } catch (error: unknown) {
    if (isNodeErrno(error) && error.code === "ENOENT") {
      return -1;
    }
    throw error;
  }

  return entries.reduce((max, entry) => {
    const match = /^iter-(\d+)$/.exec(entry);
    if (match === null) return max;
    return Math.max(max, Number.parseInt(match[1] ?? "0", 10));
  }, -1);
}

function isNodeErrno(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
