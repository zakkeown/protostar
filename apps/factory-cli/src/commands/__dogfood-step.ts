import { constants as fsConstants } from "node:fs";
import { appendFile, mkdir, open, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";

import { Command } from "@commander-js/extra-typings";
import { seedLibrary } from "@protostar/fixtures";
import { resolveWorkspaceRoot } from "@protostar/paths";
import { z } from "zod";

import { formatCursor, parseCursor, type Cursor, type CursorRun } from "../dogfood/cursor-schema.js";
import { formatReport, parseReport, type Report } from "../dogfood/report-schema.js";
import { ExitCode } from "../exit-codes.js";
import { writeStderr, writeStdoutJson } from "../io.js";
import { RUN_ID_REGEX } from "../run-id.js";

interface DogfoodStepOptions {
  readonly action?: string;
  readonly beforeSnapshot?: string;
  readonly ciVerdict?: string;
  readonly finishedAt?: string;
  readonly json?: boolean;
  readonly out?: string;
  readonly outcome?: string;
  readonly prUrl?: string;
  readonly runId?: string;
  readonly session?: string;
  readonly startedAt?: string;
  readonly timeoutSeconds?: string;
  readonly total?: string;
}

const ActionSchema = z.enum(["begin", "next-seed", "record", "discover-run-id", "snapshot-runs", "watch-ci", "finalize"]);
const SessionSchema = z.string().regex(RUN_ID_REGEX, "session must be path-safe");
const IsoDateSchema = z.string().datetime({ offset: true });
const PrUrlSchema = z.string().regex(/^https:\/\/github\.com\/zakkeown\/protostar-toy-ttt\/pull\/[0-9]+$/);
const OptionalPrUrlSchema = z.union([PrUrlSchema, z.literal("")]).optional();
const OptionalCiVerdictSchema = z.union([z.enum(["success", "failure", "timeout", "skipped"]), z.literal("")]).optional();

export function buildDogfoodStepCommand(): Command {
  const command = new Command("__dogfood-step")
    .description("Internal dogfood session stepper")
    .requiredOption("--session <sessionId>", "dogfood session id")
    .requiredOption("--action <action>", "action to execute")
    .option("--total <N>", "total run count for begin")
    .option("--json", "emit JSON for actions with structured output")
    .option("--runId <runId>", "factory run id for record")
    .option("--pr-url <url>", "GitHub PR URL for record/watch-ci")
    .option("--ci-verdict <verdict>", "CI verdict for record")
    .option("--outcome <outcome>", "dogfood row outcome for record")
    .option("--started-at <iso>", "run start timestamp for record")
    .option("--finished-at <iso>", "run finish timestamp for record")
    .option("--before-snapshot <path>", "run snapshot path for discover-run-id")
    .option("--out <path>", "snapshot output path")
    .option("--timeout-seconds <N>", "watch-ci timeout")
    .exitOverride()
    .configureOutput({
      writeOut: (str) => process.stderr.write(str),
      writeErr: (str) => process.stderr.write(str)
    })
    .action(async (opts) => {
      process.exitCode = await executeDogfoodStep(opts);
    });
  return command as unknown as Command;
}

async function executeDogfoodStep(opts: DogfoodStepOptions): Promise<number> {
  const parsed = z.object({
    action: ActionSchema,
    session: SessionSchema
  }).safeParse(opts);
  if (!parsed.success) {
    writeStderr(parsed.error.issues.map((issue) => issue.message).join("; "));
    return ExitCode.UsageOrArgError;
  }

  try {
    const workspaceRoot = resolveWorkspaceRoot();
    const paths = dogfoodPaths(workspaceRoot, parsed.data.session);
    switch (parsed.data.action) {
      case "begin":
        return await begin(paths, opts);
      case "next-seed":
        return await nextSeed(paths, opts);
      case "record":
        return await record(paths, opts);
      case "discover-run-id":
        return await discoverRunId(workspaceRoot, opts);
      case "snapshot-runs":
        return await snapshotRuns(workspaceRoot, opts);
      case "watch-ci":
        return await watchCi(opts);
      case "finalize":
        return await finalize(paths);
    }
  } catch (error: unknown) {
    writeStderr(error instanceof Error ? error.message : String(error));
    return ExitCode.GenericError;
  }
}

function dogfoodPaths(workspaceRoot: string, sessionId: string): {
  readonly sessionDir: string;
  readonly cursorPath: string;
  readonly draftPath: string;
  readonly logPath: string;
  readonly reportPath: string;
} {
  const dogfoodRoot = join(workspaceRoot, ".protostar", "dogfood");
  const sessionDir = resolve(dogfoodRoot, sessionId);
  if (!sessionDir.startsWith(`${resolve(dogfoodRoot)}/`)) {
    throw new Error("session resolves outside dogfood root");
  }
  return {
    sessionDir,
    cursorPath: join(sessionDir, "cursor"),
    draftPath: join(sessionDir, "next-draft.json"),
    logPath: join(sessionDir, "log.jsonl"),
    reportPath: join(sessionDir, "report.json")
  };
}

async function begin(paths: ReturnType<typeof dogfoodPaths>, opts: DogfoodStepOptions): Promise<number> {
  const total = parseNonnegativeInteger(opts.total, "--total");
  await mkdir(paths.sessionDir, { recursive: true });
  const existing = await readCursorIfExists(paths.cursorPath);
  if (existing !== null) {
    parseCursor(existing);
    return ExitCode.Success;
  }

  const cursor: Cursor = {
    sessionId: basename(paths.sessionDir),
    totalRuns: total,
    completed: 0,
    runs: []
  };
  await writeTextAtomic(paths.cursorPath, formatCursor(parseCursor(cursor)));
  return ExitCode.Success;
}

async function nextSeed(paths: ReturnType<typeof dogfoodPaths>, opts: DogfoodStepOptions): Promise<number> {
  const cursor = await readCursor(paths.cursorPath);
  if (cursor.completed >= cursor.totalRuns) {
    writeStderr("session complete");
    return ExitCode.GenericError;
  }

  const seed = seedLibrary[cursor.completed % seedLibrary.length];
  if (seed === undefined) {
    throw new Error("seed library is empty");
  }
  await writeTextAtomic(paths.draftPath, `${JSON.stringify(buildDraftForSeed(seed, cursor.completed), null, 2)}\n`);
  if (opts.json === true) {
    writeStdoutJson({
      seedId: seed.id,
      intent: seed.intent,
      draftPath: paths.draftPath,
      index: cursor.completed,
      total: cursor.totalRuns
    });
  }
  return ExitCode.Success;
}

async function record(paths: ReturnType<typeof dogfoodPaths>, opts: DogfoodStepOptions): Promise<number> {
  const cursor = await readCursor(paths.cursorPath);
  if (cursor.completed >= cursor.totalRuns) {
    writeStderr("session complete");
    return ExitCode.GenericError;
  }

  const parsed = z.object({
    runId: z.string().min(1),
    prUrl: OptionalPrUrlSchema,
    ciVerdict: OptionalCiVerdictSchema,
    outcome: z.enum(["pr-ready", "no-pr", "ci-timeout", "ci-failed", "run-failed"]),
    startedAt: IsoDateSchema,
    finishedAt: IsoDateSchema
  }).safeParse({
    runId: opts.runId,
    prUrl: opts.prUrl,
    ciVerdict: opts.ciVerdict,
    outcome: opts.outcome,
    startedAt: opts.startedAt,
    finishedAt: opts.finishedAt
  });
  if (!parsed.success) {
    writeStderr(parsed.error.issues.map((issue) => issue.message).join("; "));
    return ExitCode.UsageOrArgError;
  }

  const seed = seedLibrary[cursor.completed % seedLibrary.length];
  if (seed === undefined) {
    throw new Error("seed library is empty");
  }
  const run: CursorRun = {
    runId: parsed.data.runId,
    seedId: seed.id,
    outcome: parsed.data.outcome,
    startedAt: parsed.data.startedAt,
    finishedAt: parsed.data.finishedAt
  };
  const nextCursor = parseCursor({
    ...cursor,
    completed: cursor.completed + 1,
    runs: [...cursor.runs, run]
  });
  const logRow = {
    ...run,
    prUrl: emptyToUndefined(parsed.data.prUrl),
    ciVerdict: emptyToUndefined(parsed.data.ciVerdict)
  };

  await writeTextAtomic(paths.cursorPath, formatCursor(nextCursor));
  await appendJsonLine(paths.logPath, logRow);
  return ExitCode.Success;
}

async function discoverRunId(workspaceRoot: string, opts: DogfoodStepOptions): Promise<number> {
  const beforeSnapshot = requirePath(opts.beforeSnapshot, "--before-snapshot");
  const before = new Set(JSON.parse(await readFile(beforeSnapshot, "utf8")) as string[]);
  const after = await listRunIds(join(workspaceRoot, ".protostar", "runs"));
  const newRunIds = after.filter((runId) => !before.has(runId));
  if (newRunIds.length !== 1) {
    writeStderr(`expected exactly one new run, got ${newRunIds.length}`);
    return ExitCode.GenericError;
  }
  process.stdout.write(`${newRunIds[0]}\n`);
  return ExitCode.Success;
}

async function snapshotRuns(workspaceRoot: string, opts: DogfoodStepOptions): Promise<number> {
  const outPath = requirePath(opts.out, "--out");
  const runIds = await listRunIds(join(workspaceRoot, ".protostar", "runs"));
  await mkdir(dirname(outPath), { recursive: true });
  await writeTextAtomic(outPath, `${JSON.stringify(runIds)}\n`);
  return ExitCode.Success;
}

async function watchCi(opts: DogfoodStepOptions): Promise<number> {
  const parsed = z.object({
    prUrl: PrUrlSchema,
    timeoutSeconds: z.string().regex(/^[0-9]+$/).transform((value) => Number(value)).pipe(z.number().int().positive()),
    json: z.literal(true).optional()
  }).safeParse({
    prUrl: opts.prUrl,
    timeoutSeconds: opts.timeoutSeconds,
    json: opts.json
  });
  if (!parsed.success) {
    writeStderr(parsed.error.issues.map((issue) => issue.message).join("; "));
    return ExitCode.UsageOrArgError;
  }

  const prNumber = parsed.data.prUrl.split("/").at(-1);
  const outcome = await spawnGhChecks({
    prNumber: prNumber ?? "",
    timeoutMs: parsed.data.timeoutSeconds * 1000
  });
  writeStdoutJson(outcome);
  return ExitCode.Success;
}

async function finalize(paths: ReturnType<typeof dogfoodPaths>): Promise<number> {
  const cursor = await readCursor(paths.cursorPath);
  const logRows = await readLogRows(paths.logPath);
  const rows = cursor.runs.map((run) => ({
    runId: run.runId,
    seedId: run.seedId,
    outcome: run.outcome,
    prUrl: logRows.get(run.runId)?.prUrl,
    ciVerdict: logRows.get(run.runId)?.ciVerdict,
    durationMs: durationMs(run.startedAt, run.finishedAt)
  }));
  const passCount = cursor.runs.filter((run) => run.outcome === "pr-ready").length;
  const report: Report = parseReport({
    sessionId: cursor.sessionId,
    startedAt: cursor.runs[0]?.startedAt ?? new Date().toISOString(),
    finishedAt: cursor.runs.at(-1)?.finishedAt ?? new Date().toISOString(),
    totalRuns: cursor.totalRuns,
    passCount,
    passRate: cursor.totalRuns === 0 ? 0 : passCount / cursor.totalRuns,
    rows
  });
  await writeTextAtomic(paths.reportPath, formatReport(report));
  writeStderr(`dogfood session ${cursor.sessionId}: ${passCount}/${cursor.totalRuns} pr-ready (${Math.round(report.passRate * 100)}%)`);
  return ExitCode.Success;
}

async function readLogRows(logPath: string): Promise<Map<string, { readonly prUrl?: string; readonly ciVerdict?: string }>> {
  const rows = new Map<string, { readonly prUrl?: string; readonly ciVerdict?: string }>();
  let content = "";
  try {
    content = await readFile(logPath, "utf8");
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return rows;
    }
    throw error;
  }
  for (const line of content.split("\n")) {
    if (line.trim().length === 0) continue;
    const parsed = JSON.parse(line) as { readonly runId?: string; readonly prUrl?: string; readonly ciVerdict?: string };
    if (typeof parsed.runId === "string") {
      const row: { prUrl?: string; ciVerdict?: string } = {};
      if (parsed.prUrl !== undefined) row.prUrl = parsed.prUrl;
      if (parsed.ciVerdict !== undefined) row.ciVerdict = parsed.ciVerdict;
      rows.set(parsed.runId, row);
    }
  }
  return rows;
}

async function spawnGhChecks(input: {
  readonly prNumber: string;
  readonly timeoutMs: number;
}): Promise<{ readonly verdict: "success" | "failure" | "timeout"; readonly exitCode: number | null }> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn("gh", [
      "pr",
      "checks",
      input.prNumber,
      "--repo",
      "zakkeown/protostar-toy-ttt",
      "--watch",
      "--required"
    ], {
      stdio: ["ignore", "ignore", "ignore"]
    });
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGTERM");
      resolvePromise({ verdict: "timeout", exitCode: null });
    }, input.timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      resolvePromise({ verdict: code === 0 ? "success" : "failure", exitCode: code });
    });
  });
}

async function readCursor(cursorPath: string): Promise<Cursor> {
  return parseCursor(JSON.parse(await readFile(cursorPath, "utf8")));
}

async function readCursorIfExists(cursorPath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(cursorPath, "utf8"));
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeTextAtomic(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, content, "utf8");
  await rename(tmpPath, filePath);
}

async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const handle = await open(filePath, fsConstants.O_APPEND | fsConstants.O_CREAT | fsConstants.O_WRONLY, 0o666);
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
  } finally {
    await handle.close();
  }
}

async function listRunIds(runsRoot: string): Promise<readonly string[]> {
  try {
    return (await readdir(runsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && RUN_ID_REGEX.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function parseNonnegativeInteger(input: string | undefined, name: string): number {
  if (input === undefined || !/^[0-9]+$/.test(input)) {
    throw new Error(`${name} must be a nonnegative integer`);
  }
  return Number(input);
}

function requirePath(input: string | undefined, name: string): string {
  if (input === undefined || input.length === 0) {
    throw new Error(`${name} is required`);
  }
  return input;
}

function durationMs(startedAt: string, finishedAt: string): number {
  return Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
}

function emptyToUndefined<T extends string>(input: T | "" | undefined): T | undefined {
  return input === "" ? undefined : input;
}

function buildDraftForSeed(seed: (typeof seedLibrary)[number], index: number): unknown {
  const targetDescription = `In the protostar-toy-ttt sibling repository, ${seed.intent.toLowerCase()} without changing gameplay behavior or broadening the requested cosmetic scope.`;
  return {
    draftId: `draft_dogfood_${seed.id.replaceAll("-", "_")}_${index}`,
    title: `Dogfood ${seed.id}`,
    problem: `${targetDescription} This validates that Protostar can take a bounded brownfield cosmetic request from admission through implementation, review, delivery, and CI evidence.`,
    requester: "phase-10-dogfood",
    mode: "brownfield",
    goalArchetype: seed.archetype,
    context: "Protostar is running against the protostar-toy-ttt sibling repository. The target app is a small toy tic-tac-toe project, and this dogfood run must keep the edit inside the app source for one cosmetic tweak.",
    acceptanceCriteria: [
      {
        statement: `The protostar-toy-ttt app source implements this bounded cosmetic request: ${seed.intent}.`,
        verification: "evidence"
      },
      {
        statement: "The delivered PR includes evidence that the toy repository build-and-test check reaches a successful terminal state.",
        verification: "evidence"
      }
    ],
    constraints: [
      "Keep the change scoped to the protostar-toy-ttt application source.",
      "Do not edit CI configuration, package metadata, or generated build output."
    ],
    stopConditions: [
      "Stop if the factory cannot open a PR.",
      "Stop if the build-and-test check does not complete successfully within the dogfood timeout."
    ],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "protostar-toy-ttt",
          path: "src",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: "shell",
          permissionLevel: "use",
          reason: "Run bounded local commands needed to inspect and verify the toy app change.",
          risk: "low"
        },
        {
          tool: "network",
          permissionLevel: "use",
          reason: "Open the dogfood PR and inspect its required CI result.",
          risk: "low"
        }
      ],
      budget: {
        timeoutMs: 300000,
        maxRepairLoops: 1
      }
    },
    metadata: {
      fixtureKind: "dogfood-seed",
      seedId: seed.id,
      notes: seed.notes
    }
  };
}
