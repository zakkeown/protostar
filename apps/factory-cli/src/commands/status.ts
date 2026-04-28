import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { Command } from "@commander-js/extra-typings";
import type { FactoryRunManifest, FactoryRunStatus } from "@protostar/artifacts";
import { resolveWorkspaceRoot } from "@protostar/paths";

import { parseDuration } from "../duration.js";
import { ExitCode } from "../exit-codes.js";
import { writeStderr, writeStdoutJson } from "../io.js";
import { loadFactoryConfig, resolveLivenessThresholdMs } from "../load-factory-config.js";
import { listRuns } from "../run-discovery.js";
import { computeRunLiveness, type RunLivenessState } from "../run-liveness.js";
import { RUN_ID_REGEX, assertRunIdConfined, parseRunId, type RunId } from "../run-id.js";

export interface StatusRowMinimal {
  readonly runId: string;
  readonly archetype: string;
  readonly verdict: "pass" | "block" | "fail" | "repair-budget-exhausted" | "incomplete";
  readonly durationMs: number;
}

export interface StatusRowFull {
  readonly runId: string;
  readonly archetype: string;
  readonly status: FactoryRunStatus;
  readonly state: RunLivenessState | FactoryRunStatus;
  readonly reviewVerdict: "pass" | "repair" | "block" | null;
  readonly evaluationVerdict: "pass" | "fail" | null;
  readonly lineageId: string | null;
  readonly generation: number | null;
  readonly prUrl: string | null;
  readonly durationMs: number;
  readonly createdAt: number;
}

interface CommanderStatusOptions {
  readonly all?: boolean;
  readonly full?: boolean;
  readonly json?: boolean;
  readonly limit?: string;
  readonly run?: string;
  readonly since?: string;
}

type StatusRow = StatusRowMinimal | StatusRowFull;

export function buildStatusCommand(): Command {
  return new Command("status")
    .description("Show recent factory runs or a single run")
    .option("--run <runId>", "show a single run")
    .option("--limit <n>", "limit row count", "25")
    .option("--all", "ignore --limit")
    .option("--since <duration>", "only runs newer than duration (for example 24h)")
    .option("--json", "emit JSON instead of a human table")
    .option("--full", "include lineage, status, evaluation, and delivery fields")
    .exitOverride()
    .configureOutput({
      writeOut: (str) => process.stderr.write(str),
      writeErr: (str) => process.stderr.write(str)
    })
    .action(async (opts) => {
      process.exitCode = await executeStatus(opts);
    });
}

async function executeStatus(opts: CommanderStatusOptions): Promise<number> {
  const workspaceRoot = resolveWorkspaceRoot();
  const runsRoot = join(workspaceRoot, ".protostar", "runs");
  const config = await loadFactoryConfig(workspaceRoot);
  const thresholdMs = resolveLivenessThresholdMs(config.config.operator?.livenessThresholdMs);

  if (opts.run !== undefined) {
    const parsedRunId = parseRunId(opts.run);
    if (!parsedRunId.ok) {
      writeStderr(parsedRunId.reason);
      return ExitCode.UsageOrArgError;
    }
    try {
      assertRunIdConfined(runsRoot, parsedRunId.value);
    } catch (error: unknown) {
      writeStderr(error instanceof Error ? error.message : String(error));
      return ExitCode.UsageOrArgError;
    }

    const runDir = resolve(runsRoot, parsedRunId.value);
    if (!(await fileExists(join(runDir, "manifest.json")))) {
      writeStderr(`run ${parsedRunId.value} not found`);
      return ExitCode.NotFound;
    }
    const row = await buildRow({ runDir, runId: parsedRunId.value, full: opts.full === true, thresholdMs });
    emitRows(row, { json: opts.json === true, full: opts.full === true });
    return ExitCode.Success;
  }

  const parsedLimit = parseLimit(opts.limit ?? "25");
  if (!parsedLimit.ok) {
    writeStderr(parsedLimit.error);
    return ExitCode.UsageOrArgError;
  }

  const parsedSince = opts.since === undefined ? { ok: true as const, ms: undefined } : parseDuration(opts.since);
  if (!parsedSince.ok) {
    writeStderr(parsedSince.reason);
    return ExitCode.UsageOrArgError;
  }

  const entries = await listRuns({
    runsRoot,
    runIdRegex: RUN_ID_REGEX,
    all: opts.all === true,
    ...(opts.all === true ? {} : { limit: parsedLimit.value }),
    ...(parsedSince.ms !== undefined ? { sinceMs: parsedSince.ms } : {})
  });
  const rows = await Promise.all(
    entries.map((entry) =>
      buildRow({ runDir: entry.path, runId: entry.runId as RunId, full: opts.full === true, thresholdMs })
    )
  );

  emitRows(rows, { json: opts.json === true, full: opts.full === true });
  return ExitCode.Success;
}

function emitRows(rows: StatusRow | readonly StatusRow[], opts: { readonly json: boolean; readonly full: boolean }): void {
  if (opts.json) {
    writeStdoutJson(rows);
    return;
  }

  const list = Array.isArray(rows) ? rows : [rows];
  process.stdout.write(`${renderTable(list, opts.full)}\n`);
}

async function buildRow(input: {
  readonly runDir: string;
  readonly runId: RunId;
  readonly full: boolean;
  readonly thresholdMs: number;
}): Promise<StatusRow> {
  const manifest = (await readJson(join(input.runDir, "manifest.json"))) as ManifestWithArchetype;
  const liveness = await computeRunLiveness({ runDir: input.runDir, thresholdMs: input.thresholdMs });
  const reviewVerdict = await readReviewVerdict(input.runDir);
  const durationMs = computeDurationMs(manifest);
  const archetype = typeof manifest.archetype === "string" ? manifest.archetype : "unknown";

  if (!input.full) {
    return {
      runId: input.runId,
      archetype,
      verdict: minimalVerdict(reviewVerdict),
      durationMs
    };
  }

  const evolution = await readOptionalJson(join(input.runDir, "evolution", "snapshot.json"));
  const delivery = await readOptionalJson(join(input.runDir, "delivery", "result.json"));
  return {
    runId: input.runId,
    archetype,
    status: manifest.status,
    state: liveness.state,
    reviewVerdict,
    evaluationVerdict: await readEvaluationVerdict(input.runDir),
    lineageId: readOptionalString(evolution, "lineageId"),
    generation: readOptionalNumber(evolution, "generation"),
    prUrl: readOptionalString(delivery, "prUrl"),
    durationMs,
    createdAt: Date.parse(manifest.createdAt)
  };
}

function renderTable(rows: readonly StatusRow[], full: boolean): string {
  const headers = full
    ? ["RUN ID", "ARCHETYPE", "STATUS", "STATE", "DURATION"]
    : ["RUN ID", "ARCHETYPE", "VERDICT", "DURATION"];
  const body = rows.map((row) =>
    full && "status" in row
      ? [row.runId, row.archetype, row.status, row.state, String(row.durationMs)]
      : [row.runId, row.archetype, (row as StatusRowMinimal).verdict, String(row.durationMs)]
  );
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...body.map((cells) => cells[index]?.length ?? 0))
  );
  const render = (cells: readonly string[]) =>
    cells.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join("  ").trimEnd();
  return [render(headers), ...body.map(render)].join("\n");
}

function minimalVerdict(reviewVerdict: StatusRowFull["reviewVerdict"]): StatusRowMinimal["verdict"] {
  if (reviewVerdict === "pass") return "pass";
  if (reviewVerdict === "block") return "block";
  if (reviewVerdict === "repair") return "repair-budget-exhausted";
  return "incomplete";
}

function computeDurationMs(manifest: FactoryRunManifest): number {
  const createdAt = Date.parse(manifest.createdAt);
  const completedAt = manifest.stages
    .map((stage) => stage.completedAt)
    .filter((value): value is string => value !== undefined)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];
  return Math.max(0, (completedAt ?? Date.now()) - createdAt);
}

async function readReviewVerdict(runDir: string): Promise<StatusRowFull["reviewVerdict"]> {
  const json = await readOptionalJson(join(runDir, "review-gate.json"));
  const verdict = readOptionalString(json, "verdict");
  return verdict === "pass" || verdict === "repair" || verdict === "block" ? verdict : null;
}

async function readEvaluationVerdict(runDir: string): Promise<StatusRowFull["evaluationVerdict"]> {
  const json = await readOptionalJson(join(runDir, "evaluation-report.json"));
  const verdict = readOptionalString(json, "verdict");
  return verdict === "pass" || verdict === "fail" ? verdict : null;
}

function parseLimit(value: string): { readonly ok: true; readonly value: number } | { readonly ok: false; readonly error: string } {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    return { ok: false, error: "--limit must be a positive integer." };
  }
  return { ok: true, value: limit };
}

async function readOptionalJson(filePath: string): Promise<unknown> {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function readOptionalString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null || !(key in value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

function readOptionalNumber(value: unknown, key: string): number | null {
  if (typeof value !== "object" || value === null || !(key in value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" ? field : null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

type ManifestWithArchetype = FactoryRunManifest & { readonly archetype?: string };
