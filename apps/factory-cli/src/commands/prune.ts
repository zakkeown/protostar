import * as fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

import { Command } from "@commander-js/extra-typings";
import type { FactoryRunManifest, FactoryRunStatus } from "@protostar/artifacts";
import { resolveWorkspaceRoot } from "@protostar/paths";

import { parseDuration } from "../duration.js";
import { ExitCode } from "../exit-codes.js";
import { writeStderr, writeStdoutJson } from "../io.js";
import { listRuns } from "../run-discovery.js";
import { RUN_ID_REGEX } from "../run-id.js";

interface CommanderPruneOptions {
  readonly archetype?: string;
  readonly confirm?: boolean;
  readonly dryRun?: boolean;
  readonly olderThan?: string;
}

interface PruneCandidate {
  readonly runId: string;
  readonly mtimeMs: number;
  readonly status: FactoryRunStatus | StressSessionStatus | "unknown";
  readonly archetype: string | null;
  readonly eventsJsonlSha256?: string;
}

interface InternalPruneCandidate {
  readonly candidate: PruneCandidate;
  readonly path: string;
}

interface PruneProtected {
  readonly runId: string;
  readonly reason: string;
}

interface PruneOutput {
  readonly scanned: number;
  readonly candidates: readonly PruneCandidate[];
  readonly protected: readonly PruneProtected[];
  readonly deleted: readonly { readonly runId: string }[];
  readonly dryRun: boolean;
}

type ManifestWithArchetype = FactoryRunManifest & { readonly archetype?: string };
type StressSessionStatus = "running" | "completed" | "aborted" | "cancelled";

const activeStatuses = new Set<FactoryRunStatus>([
  "created",
  "running",
  "cancelling",
  "repairing",
  "ready-to-release",
  "orphaned"
]);
const terminalStressStatuses = new Set<StressSessionStatus>(["completed", "aborted", "cancelled"]);

export function buildPruneCommand(): Command {
  const command = new Command("prune")
    .description("Prune old terminal run directories")
    .option("--older-than <duration>", "only prune runs older than this duration (for example 7d)")
    .option("--dry-run", "report candidates without deleting (default)")
    .option("--archetype <name>", "only consider runs whose manifest.archetype exactly matches")
    .option("--confirm", "actually delete candidate runs/<id> directories")
    .addHelpText(
      "after",
      "\nSafety: default is dry-run. --confirm is required to remove .protostar/runs/<id>/, .protostar/dogfood/<sessionId>/, or .protostar/stress/<sessionId>/ directories."
    )
    .exitOverride()
    .configureOutput({
      writeOut: (str) => process.stderr.write(str),
      writeErr: (str) => process.stderr.write(str)
    })
    .action(async (opts) => {
      process.exitCode = await executePrune(opts);
    });
  return command as unknown as Command;
}

async function executePrune(opts: CommanderPruneOptions): Promise<number> {
  if (opts.olderThan === undefined) {
    writeStderr("Missing required --older-than <duration>.");
    return ExitCode.UsageOrArgError;
  }

  const parsedDuration = parseDuration(opts.olderThan);
  if (!parsedDuration.ok) {
    writeStderr(parsedDuration.reason);
    return ExitCode.UsageOrArgError;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  const runsRoot = join(workspaceRoot, ".protostar", "runs");
  const dogfoodRoot = join(workspaceRoot, ".protostar", "dogfood");
  const stressRoot = join(workspaceRoot, ".protostar", "stress");
  const thresholdMs = Date.now() - parsedDuration.ms;
  const entries = (
    await listRuns({
      runsRoot,
      runIdRegex: RUN_ID_REGEX,
      all: true
    })
  ).filter((entry) => entry.mtimeMs <= thresholdMs);
  const dogfoodEntries = (
    await listRuns({
      runsRoot: dogfoodRoot,
      runIdRegex: RUN_ID_REGEX,
      all: true
    })
  ).filter((entry) => entry.mtimeMs <= thresholdMs);
  const stressEntries = (
    await listRuns({
      runsRoot: stressRoot,
      runIdRegex: RUN_ID_REGEX,
      all: true
    })
  ).filter((entry) => entry.mtimeMs <= thresholdMs);

  const candidates: InternalPruneCandidate[] = [];
  const protectedRuns: PruneProtected[] = [];
  for (const entry of entries) {
    const manifest = await readManifest(join(entry.path, "manifest.json"));
    if (!manifest.ok) {
      protectedRuns.push({ runId: entry.runId, reason: "manifest-unreadable" });
      continue;
    }

    const archetype = typeof manifest.value.archetype === "string" ? manifest.value.archetype : null;
    if (opts.archetype !== undefined && archetype !== opts.archetype) {
      continue;
    }

    if (activeStatuses.has(manifest.value.status)) {
      // Active guard literal reasons include: active-running, active-cancelling,
      // active-repairing, active-ready-to-release, active-created, active-orphaned.
      protectedRuns.push({ runId: entry.runId, reason: `active-${manifest.value.status}` });
      continue;
    }

    candidates.push({
      candidate: {
        runId: entry.runId,
        mtimeMs: entry.mtimeMs,
        status: manifest.value.status,
        archetype
      },
      path: entry.path
    });
  }

  for (const entry of dogfoodEntries) {
    if (opts.archetype !== undefined) {
      continue;
    }

    const cursor = await readDogfoodCursor(join(entry.path, "cursor"));
    if (!cursor.ok) {
      protectedRuns.push({ runId: entry.runId, reason: "cursor-unreadable" });
      continue;
    }

    if (cursor.value.completed < cursor.value.totalRuns) {
      protectedRuns.push({ runId: entry.runId, reason: "active-dogfood-session" });
      continue;
    }

    candidates.push({
      candidate: {
        runId: entry.runId,
        mtimeMs: entry.mtimeMs,
        status: "unknown",
        archetype: null
      },
      path: entry.path
    });
  }

  for (const entry of stressEntries) {
    if (opts.archetype !== undefined) {
      continue;
    }

    const cursor = await readStressCursor(join(entry.path, "cursor.json"));
    if (!cursor.ok) {
      protectedRuns.push({ runId: entry.runId, reason: "cursor-unreadable" });
      continue;
    }

    const report = await readStressReport(join(entry.path, "stress-report.json"));
    const finishedAt = cursor.value.finishedAt ?? report.finishedAt;
    if (!terminalStressStatuses.has(cursor.value.status) || finishedAt === undefined) {
      protectedRuns.push({ runId: entry.runId, reason: "active-stress-session" });
      continue;
    }

    candidates.push({
      candidate: {
        runId: entry.runId,
        mtimeMs: entry.mtimeMs,
        status: cursor.value.status,
        archetype: null,
        ...(await hashFileIfExists(join(entry.path, "events.jsonl")))
      },
      path: entry.path
    });
  }

  const dryRun = opts.confirm !== true;
  const outputCandidates = candidates.map((candidate) => candidate.candidate);
  if (dryRun) {
    writeStdoutJson({
      scanned: entries.length + dogfoodEntries.length + stressEntries.length,
      candidates: outputCandidates,
      protected: protectedRuns,
      deleted: [],
      dryRun: true
    } satisfies PruneOutput);
    return ExitCode.Success;
  }

  const deleted: { readonly runId: string }[] = [];
  for (const candidate of candidates) {
    // Phase 9 Q-22 + Phase 10 dogfood extension: prune ONLY removes scoped
    // runs/<id>/ or dogfood/<sessionId>/ subtrees. Workspace-level
    // append-only files (.protostar/refusals.jsonl,
    // .protostar/evolution/{lineageId}.jsonl) are NEVER touched. The
    // active guards above + listRuns RUN_ID_REGEX filtering keep deletion
    // confined to enumerated session directories.
    await fs.rm(candidate.path, { recursive: true, force: true });
    deleted.push({ runId: candidate.candidate.runId });
  }

  writeStdoutJson({
    scanned: entries.length + dogfoodEntries.length + stressEntries.length,
    candidates: outputCandidates,
    protected: protectedRuns,
    deleted,
    dryRun: false
  } satisfies PruneOutput);
  return ExitCode.Success;
}

async function readManifest(
  manifestPath: string
): Promise<{ readonly ok: true; readonly value: ManifestWithArchetype } | { readonly ok: false }> {
  try {
    return { ok: true, value: JSON.parse(await fs.readFile(manifestPath, "utf8")) as ManifestWithArchetype };
  } catch {
    return { ok: false };
  }
}

async function readDogfoodCursor(
  cursorPath: string
): Promise<{ readonly ok: true; readonly value: { readonly completed: number; readonly totalRuns: number } } | { readonly ok: false }> {
  try {
    const parsed = JSON.parse(await fs.readFile(cursorPath, "utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "completed" in parsed &&
      "totalRuns" in parsed &&
      typeof parsed.completed === "number" &&
      typeof parsed.totalRuns === "number"
    ) {
      return { ok: true, value: { completed: parsed.completed, totalRuns: parsed.totalRuns } };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

async function readStressCursor(
  cursorPath: string
): Promise<{
  readonly ok: true;
  readonly value: {
    readonly status: StressSessionStatus;
    readonly finishedAt?: string;
  };
} | { readonly ok: false }> {
  try {
    const parsed = JSON.parse(await fs.readFile(cursorPath, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false };
    }
    const record = parsed as Record<string, unknown>;
    const status = record["status"];
    if (status !== "running" && status !== "completed" && status !== "aborted" && status !== "cancelled") {
      return { ok: false };
    }
    return {
      ok: true,
      value: {
        status,
        ...(typeof record["finishedAt"] === "string" ? { finishedAt: record["finishedAt"] } : {})
      }
    };
  } catch {
    return { ok: false };
  }
}

async function readStressReport(
  reportPath: string
): Promise<{ readonly finishedAt?: string }> {
  try {
    const parsed = JSON.parse(await fs.readFile(reportPath, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const finishedAt = (parsed as Record<string, unknown>)["finishedAt"];
    return typeof finishedAt === "string" ? { finishedAt } : {};
  } catch {
    return {};
  }
}

async function hashFileIfExists(
  filePath: string
): Promise<{ readonly eventsJsonlSha256?: string }> {
  try {
    return {
      eventsJsonlSha256: createHash("sha256").update(await fs.readFile(filePath)).digest("hex")
    };
  } catch {
    return {};
  }
}
