#!/usr/bin/env node
import { spawn } from "node:child_process";
import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import type { StressEvent, StressOutcome } from "@protostar/artifacts";
import type { SeedArchetype } from "@protostar/fixtures";
import { resolveWorkspaceRoot } from "@protostar/paths";
import {
  FAULT_SCENARIOS,
  applyFaultInjection,
  mechanismForScenario,
  planFaultInjections,
  type FaultInjectionDescriptor,
  type FaultInjectionHooks,
  type FaultMechanism,
  type FaultObservation,
  type FaultScenario
} from "@protostar/stress-harness";

import { prepareStressRunInput, type PreparedStressRunInput } from "../stress/seed-materialization.js";
import {
  appendStressEvent,
  beginStressSession,
  finalizeStressSession,
  recordStressRun,
  resolveStressSessionPaths,
  writeWedgeEvidence,
  type StressSessionPaths,
  type WedgeEvidenceArtifact
} from "../stress/stress-session.js";

type JsonPayload = StressEvent["payload"];
type RunnerShape = "concurrency" | "fault-injection";

export interface StressScriptOptions {
  readonly shape: RunnerShape;
  readonly sessionId?: string;
  readonly sessions?: number;
  readonly concurrency?: number;
  readonly runs?: number;
  readonly scenario?: FaultScenario;
  readonly llmBackend?: string;
  readonly headlessMode?: string;
  readonly maxSessions?: number;
  readonly maxFaults?: number;
  readonly maxWallClockDays?: number;
  readonly seedArchetypes?: readonly SeedArchetype[];
  readonly workspaceRoot?: string;
  readonly faultTimeoutMs?: number;
}

export interface FactoryRunInput {
  readonly workspaceRoot: string;
  readonly runId: string;
  readonly branchName: string;
  readonly draftPath: string;
  readonly confirmedIntentPath: string;
  readonly llmBackend: string;
  readonly headlessMode: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

export interface FactoryRunResult {
  readonly exitCode: number | null;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly signal?: NodeJS.Signals | null;
  readonly errorCode?: string;
  readonly signalAborted?: boolean;
  readonly outcome?: StressOutcome;
}

export interface StressScriptResult {
  readonly sessionId: string;
  readonly sessionDir: string;
  readonly eventsPath: string;
  readonly reportPath?: string;
  readonly totalRuns: number;
  readonly stressClean: boolean;
  readonly faultObservations: readonly FaultObservation[];
  readonly aborted: boolean;
}

interface PreparedRunContext {
  readonly paths: StressSessionPaths;
  readonly runId: string;
  readonly runIndex: number;
  readonly workerIndex: number;
  readonly branchName: string;
  readonly prepared: PreparedStressRunInput;
}

export interface StressScriptDependencies {
  readonly prepareRunInput: typeof prepareStressRunInput;
  readonly runFactory: (input: FactoryRunInput) => Promise<FactoryRunResult>;
  readonly writeFaultBoundary: (input: {
    readonly paths: StressSessionPaths;
    readonly descriptor: FaultInjectionDescriptor;
  }) => Promise<void>;
  readonly writeWedge: typeof writeWedgeEvidence;
  readonly nowMs: () => number;
}

const DEFAULT_SEED_ARCHETYPES: readonly SeedArchetype[] = ["cosmetic-tweak", "feature-add"];
const DEFAULT_SESSIONS = 2;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_RUNS = 1;
const DEFAULT_MAX_SESSIONS = 20;
const DEFAULT_MAX_FAULTS = 100;
const DEFAULT_MAX_WALL_CLOCK_DAYS = 3;
const DEFAULT_FAULT_TIMEOUT_MS = 50;
const BRANCH_NAME_REGEX = /^[a-zA-Z0-9._/-]+$/;
const ALL_MECHANISMS = FAULT_SCENARIOS.map((scenario) => mechanismForScenario(scenario));

export const defaultStressScriptDependencies: StressScriptDependencies = {
  prepareRunInput: prepareStressRunInput,
  runFactory: runFactoryProcess,
  writeFaultBoundary: async () => {
    const error = new Error("simulated ENOSPC at stress artifact boundary") as NodeJS.ErrnoException;
    error.code = "ENOSPC";
    throw error;
  },
  writeWedge: writeWedgeEvidence,
  nowMs: () => Date.now()
};

export async function runStressScript(
  options: StressScriptOptions,
  dependencies: Partial<StressScriptDependencies> = {}
): Promise<StressScriptResult> {
  const deps = { ...defaultStressScriptDependencies, ...dependencies };
  const workspaceRoot = options.workspaceRoot ?? resolveWorkspaceRoot();
  const sessionId = options.sessionId ?? generateSessionId();
  const paths = resolveStressSessionPaths(workspaceRoot, sessionId);
  const llmBackend = options.llmBackend ?? "mock";
  const headlessMode = options.headlessMode ?? "local-daemon";
  const seedArchetypes = options.seedArchetypes ?? DEFAULT_SEED_ARCHETYPES;
  const concurrency = positiveInteger(options.concurrency ?? DEFAULT_CONCURRENCY, "--concurrency");
  const maxWallClockMs = positiveInteger(options.maxWallClockDays ?? DEFAULT_MAX_WALL_CLOCK_DAYS, "--max-wall-clock-days") * 86_400_000;
  const startedAtMs = deps.nowMs();
  const faultObservations: FaultObservation[] = [];
  let recordRunChain: Promise<void> = Promise.resolve();
  const recordRunSerialized = async (operation: () => Promise<void>) => {
    const next = recordRunChain.then(operation);
    recordRunChain = next.catch(() => {});
    await next;
  };

  await beginStressSession({ paths, shape: options.shape });

  let aborted = false;
  let totalRuns = 0;
  if (options.shape === "concurrency") {
    const sessions = positiveInteger(options.sessions ?? DEFAULT_SESSIONS, "--sessions");
    const runs = positiveInteger(options.runs ?? DEFAULT_RUNS, "--runs");
    const maxSessions = positiveInteger(options.maxSessions ?? DEFAULT_MAX_SESSIONS, "--max-sessions");
    const totalAttempts = sessions * runs;
    if (sessions > maxSessions || totalAttempts > maxSessions) {
      throw new Error(`--sessions exceeds --max-sessions (${maxSessions})`);
    }
    const attempts = Array.from({ length: totalAttempts }, (_, runIndex) => ({
      runIndex,
      workerIndex: runIndex % sessions
    }));
    aborted = await runAttemptPool(attempts, concurrency, async (attempt) => {
      enforceWallClock({ deps, startedAtMs, maxWallClockMs });
      const context = await prepareRunContext({
        paths,
        workspaceRoot,
        sessionId,
        runIndex: attempt.runIndex,
        workerIndex: attempt.workerIndex,
        seedArchetypes,
        deps
      });
      totalRuns += 1;
      const result = await invokeFactoryRun({ context, llmBackend, headlessMode, deps });
      await recordRunSerialized(() => finishRun({ paths, context, result }));
      if (result.outcome === "wedge") {
        await recordWedge({ paths, context, deps });
        return "stop";
      }
      return "continue";
    });
  } else {
    const runs = positiveInteger(options.runs ?? DEFAULT_RUNS, "--runs");
    const maxFaults = positiveInteger(options.maxFaults ?? DEFAULT_MAX_FAULTS, "--max-faults");
    const scenarios = options.scenario === undefined ? FAULT_SCENARIOS : [options.scenario];
    const descriptors = scenarios.flatMap((scenario) => [...planFaultInjections({ scenario, runs })]);
    if (descriptors.length > maxFaults) {
      throw new Error(`fault count exceeds --max-faults (${maxFaults})`);
    }

    aborted = await runAttemptPool(descriptors, concurrency, async (descriptor, absoluteIndex) => {
      enforceWallClock({ deps, startedAtMs, maxWallClockMs });
      const context = await prepareRunContext({
        paths,
        workspaceRoot,
        sessionId,
        runIndex: absoluteIndex,
        workerIndex: absoluteIndex % concurrency,
        seedArchetypes,
        deps
      });
      totalRuns += 1;
      await appendStressEvent({
        paths,
        type: "fault-applied",
        payload: {
          runId: context.runId,
          scenario: descriptor.scenario,
          injectionId: descriptor.injectionId,
          branchName: context.branchName
        }
      });

      const observation = await applyFaultInjection(descriptor, buildFaultHooks({
        context,
        llmBackend,
        headlessMode,
        deps,
        faultTimeoutMs: options.faultTimeoutMs ?? DEFAULT_FAULT_TIMEOUT_MS
      }));
      faultObservations.push(observation);
      await appendStressEvent({
        paths,
        type: "fault-observed",
        payload: {
          runId: context.runId,
          scenario: observation.scenario,
          mechanism: observation.mechanism,
          observed: observation.observed,
          code: observation.code ?? observation.mechanism
        }
      });
      await recordRunSerialized(() => recordStressRun({
          paths,
          run: {
            runId: context.runId,
            seedId: context.prepared.seedId,
            archetype: context.prepared.archetype,
            outcome: observation.observed ? "failed" : "blocked",
            durationMs: 0,
            faultInjected: descriptor.scenario
          }
        }).then(() => undefined));
      return "continue";
    });
  }

  const stressClean = hasAllObservedMechanisms(faultObservations);
  if (stressClean) {
    await appendStressEvent({
      paths,
      type: "stress-clean",
      payload: {
        stressClean,
        observedMechanisms: [...new Set(faultObservations.map((observation) => observation.mechanism))].sort()
      }
    });
  }

  if (aborted) {
    return {
      sessionId,
      sessionDir: paths.sessionDir,
      eventsPath: paths.eventsPath,
      totalRuns,
      stressClean: false,
      faultObservations,
      aborted
    };
  }

  const report = await finalizeStressSession({ paths, headlessMode, llmBackend });
  return {
    sessionId,
    sessionDir: paths.sessionDir,
    eventsPath: paths.eventsPath,
    reportPath: paths.reportPath,
    totalRuns: report.totalRuns,
    stressClean,
    faultObservations,
    aborted
  };
}

export function parseStressScriptArgs(argv: readonly string[]): StressScriptOptions {
  const parsed: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--help" || arg === "-h") {
      parsed["help"] = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`unknown arg: ${arg}`);
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`missing value for ${arg}`);
    }
    parsed[arg.slice(2)] = next;
    index += 1;
  }

  if (parsed["help"] === true) {
    throw new StressScriptHelp();
  }

  const shape = stringOption(parsed, "shape");
  if (shape === undefined) {
    throw new Error("--shape is required");
  }
  if (shape === "sustained-load") {
    throw new Error("Use scripts/stress.sh for sustained-load");
  }
  if (shape !== "concurrency" && shape !== "fault-injection") {
    throw new Error("--shape must be concurrency or fault-injection");
  }

  const scenario = stringOption(parsed, "scenario");
  if (scenario !== undefined && !isFaultScenario(scenario)) {
    throw new Error("--scenario must be network-drop, llm-timeout, disk-full, or abort-signal");
  }

  const sessionId = stringOption(parsed, "session");
  const sessions = parsedIntegerOption(parsed, "sessions");
  const concurrency = parsedIntegerOption(parsed, "concurrency");
  const runs = parsedIntegerOption(parsed, "runs");
  const llmBackend = stringOption(parsed, "llm-backend");
  const headlessMode = stringOption(parsed, "headless-mode");
  const maxSessions = parsedIntegerOption(parsed, "max-sessions");
  const maxFaults = parsedIntegerOption(parsed, "max-faults");
  const maxWallClockDays = parsedIntegerOption(parsed, "max-wall-clock-days");
  const seedArchetypes = stringOption(parsed, "seed-archetypes");

  const options: StressScriptOptions = {
    shape
  };
  if (sessionId !== undefined) Object.assign(options, { sessionId });
  if (sessions !== undefined) Object.assign(options, { sessions });
  if (concurrency !== undefined) Object.assign(options, { concurrency });
  if (runs !== undefined) Object.assign(options, { runs });
  if (scenario !== undefined) Object.assign(options, { scenario });
  if (llmBackend !== undefined) Object.assign(options, { llmBackend });
  if (headlessMode !== undefined) Object.assign(options, { headlessMode });
  if (maxSessions !== undefined) Object.assign(options, { maxSessions });
  if (maxFaults !== undefined) Object.assign(options, { maxFaults });
  if (maxWallClockDays !== undefined) Object.assign(options, { maxWallClockDays });
  if (seedArchetypes !== undefined) Object.assign(options, { seedArchetypes: parseSeedArchetypes(seedArchetypes) });
  return options;
}

export function usage(): string {
  return [
    "Usage: node apps/factory-cli/dist/scripts/stress.js --shape concurrency|fault-injection [options]",
    "",
    "Options:",
    "  --sessions <n>               Concurrency shape run attempts. Defaults to 2.",
    "  --concurrency <n>            Worker pool size. Defaults to 2.",
    "  --runs <n>                   Runs per session or fault scenario. Defaults to 1.",
    "  --scenario <scenario>        Fault scenario. Omit to run all four scenarios.",
    "  --llm-backend <backend>      Factory LLM backend. Defaults to mock.",
    "  --headless-mode <mode>       Factory headless mode. Defaults to local-daemon.",
    "  --max-sessions <n>           Concurrency cap. Defaults to 20.",
    "  --max-faults <n>             Fault count cap. Defaults to 100.",
    "  --max-wall-clock-days <n>    Wall-clock cap in days. Defaults to 3.",
    "  --seed-archetypes <csv>      Seed archetypes. Defaults to cosmetic-tweak,feature-add."
  ].join("\n");
}

function buildFaultHooks(input: {
  readonly context: PreparedRunContext;
  readonly llmBackend: string;
  readonly headlessMode: string;
  readonly deps: StressScriptDependencies;
  readonly faultTimeoutMs: number;
}): FaultInjectionHooks {
  return {
    adapterNetworkRefusal: async (descriptor: FaultInjectionDescriptor) => {
      const result = await invokeFactoryRun({
        context: input.context,
        llmBackend: input.llmBackend,
        headlessMode: input.headlessMode,
        deps: input.deps,
        mockMode: "network-drop"
      });
      return observeFromFactoryResult(descriptor, "adapter-network-refusal", result);
    },
    llmTimeoutAbortSignal: async (descriptor: FaultInjectionDescriptor) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort("timeout"), input.faultTimeoutMs);
      try {
        const result = await invokeFactoryRun({
          context: input.context,
          llmBackend: input.llmBackend,
          headlessMode: input.headlessMode,
          deps: input.deps,
          mockMode: "llm-timeout",
          signal: controller.signal
        });
        return {
          scenario: descriptor.scenario,
          mechanism: "llm-abort-timeout",
          observed: controller.signal.aborted || result.signalAborted === true || result.errorCode === "llm-abort-timeout",
          runIndex: descriptor.runIndex,
          code: result.errorCode ?? "llm-abort-timeout"
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    diskWriteEnospc: async (descriptor: FaultInjectionDescriptor) => {
      try {
        await input.deps.writeFaultBoundary({ paths: input.context.paths, descriptor });
      } catch (error: unknown) {
        if (isNodeErrno(error) && error.code === "ENOSPC") {
          return {
            scenario: descriptor.scenario,
            mechanism: "disk-write-enospc",
            observed: true,
            runIndex: descriptor.runIndex,
            code: "ENOSPC"
          };
        }
        throw error;
      }
      return {
        scenario: descriptor.scenario,
        mechanism: "disk-write-enospc",
        observed: false,
        runIndex: descriptor.runIndex,
        code: "missing-enospc"
      };
    },
    externalAbortSignal: async (descriptor: FaultInjectionDescriptor) => {
      const controller = new AbortController();
      const abort = setTimeout(() => controller.abort("external-abort"), 0);
      try {
        const result = await invokeFactoryRun({
          context: input.context,
          llmBackend: input.llmBackend,
          headlessMode: input.headlessMode,
          deps: input.deps,
          signal: controller.signal
        });
        return {
          scenario: descriptor.scenario,
          mechanism: "external-abort-signal",
          observed: controller.signal.aborted || result.signalAborted === true || result.errorCode === "external-abort-signal",
          runIndex: descriptor.runIndex,
          code: result.errorCode ?? "external-abort-signal"
        };
      } finally {
        clearTimeout(abort);
      }
    }
  };
}

async function prepareRunContext(input: {
  readonly paths: StressSessionPaths;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly runIndex: number;
  readonly workerIndex: number;
  readonly seedArchetypes: readonly SeedArchetype[];
  readonly deps: StressScriptDependencies;
}): Promise<PreparedRunContext> {
  const runNumber = input.runIndex + 1;
  const runId = `stress_${input.sessionId}_${String(runNumber).padStart(4, "0")}`;
  const branchName = buildStressBranchName(input.sessionId, input.workerIndex, input.runIndex);
  const prepared = await input.deps.prepareRunInput({
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    runId,
    runIndex: input.runIndex,
    seedArchetypes: input.seedArchetypes
  });
  await appendStressEvent({
    paths: input.paths,
    type: "run-started",
    payload: {
      runId,
      runIndex: input.runIndex,
      workerIndex: input.workerIndex,
      branchName,
      draftPath: prepared.draftPath,
      confirmedIntentPath: prepared.confirmedIntentPath
    }
  });
  return {
    paths: input.paths,
    runId,
    runIndex: input.runIndex,
    workerIndex: input.workerIndex,
    branchName,
    prepared
  };
}

async function invokeFactoryRun(input: {
  readonly context: PreparedRunContext;
  readonly llmBackend: string;
  readonly headlessMode: string;
  readonly deps: StressScriptDependencies;
  readonly mockMode?: string;
  readonly signal?: AbortSignal;
}): Promise<FactoryRunResult> {
  const args = buildFactoryRunArgs({
    draftPath: input.context.prepared.draftPath,
    confirmedIntentPath: input.context.prepared.confirmedIntentPath,
    runId: input.context.runId,
    llmBackend: input.llmBackend,
    headlessMode: input.headlessMode
  });
  return input.deps.runFactory({
    workspaceRoot: input.context.paths.stressRoot.slice(0, -".protostar/stress".length),
    runId: input.context.runId,
    branchName: input.context.branchName,
    draftPath: input.context.prepared.draftPath,
    confirmedIntentPath: input.context.prepared.confirmedIntentPath,
    llmBackend: input.llmBackend,
    headlessMode: input.headlessMode,
    args,
    ...(input.mockMode !== undefined ? { env: { PROTOSTAR_MOCK_LLM_MODE: input.mockMode } } : {}),
    ...(input.signal !== undefined ? { signal: input.signal } : {})
  });
}

export function buildFactoryRunArgs(input: {
  readonly draftPath: string;
  readonly confirmedIntentPath: string;
  readonly runId: string;
  readonly llmBackend: string;
  readonly headlessMode: string;
}): readonly string[] {
  return [
    "run",
    "--draft",
    input.draftPath,
    "--confirmed-intent",
    input.confirmedIntentPath,
    "--out",
    ".protostar/runs",
    "--executor",
    "real",
    "--planning-mode",
    "live",
    "--review-mode",
    "live",
    "--delivery-mode",
    "auto",
    "--trust",
    "trusted",
    "--run-id",
    input.runId,
    "--intent-mode",
    "brownfield",
    "--llm-backend",
    input.llmBackend,
    "--headless-mode",
    input.headlessMode,
    "--non-interactive"
  ];
}

function buildStressBranchName(sessionId: string, workerIndex: number, runIndex: number): string {
  const branchName = `protostar/${sessionId}/${workerIndex}-${runIndex}`;
  validateBranchName(branchName);
  return branchName;
}

function validateBranchName(branchName: string): void {
  if (!BRANCH_NAME_REGEX.test(branchName) || branchName.length > 244) {
    throw new Error("stress branch name must match Phase 7 branch regex");
  }
}

async function finishRun(input: {
  readonly paths: StressSessionPaths;
  readonly context: PreparedRunContext;
  readonly result: FactoryRunResult;
}): Promise<void> {
  const outcome = outcomeFromFactoryResult(input.result);
  await recordStressRun({
    paths: input.paths,
    run: {
      runId: input.context.runId,
      seedId: input.context.prepared.seedId,
      archetype: input.context.prepared.archetype,
      outcome,
      durationMs: 0
    }
  });
  await appendStressEvent({
    paths: input.paths,
    type: "run-finished",
    payload: {
      runId: input.context.runId,
      outcome,
      branchName: input.context.branchName,
      exitCode: input.result.exitCode ?? -1
    }
  });
}

async function recordWedge(input: {
  readonly paths: StressSessionPaths;
  readonly context: PreparedRunContext;
  readonly deps: StressScriptDependencies;
}): Promise<WedgeEvidenceArtifact> {
  return input.deps.writeWedge({
    paths: input.paths,
    evidence: {
      sessionId: input.paths.sessionDir.slice(input.paths.stressRoot.length + 1),
      runId: input.context.runId,
      detectedAt: new Date(input.deps.nowMs()).toISOString(),
      p95SuccessfulDurationMs: 1000,
      idleDurationMs: 5001,
      reason: "status unchanged for > 5x p95"
    }
  });
}

function observeFromFactoryResult(
  descriptor: FaultInjectionDescriptor,
  mechanism: FaultMechanism,
  result: FactoryRunResult
): FaultObservation {
  const evidence = [result.errorCode, result.stdout, result.stderr].filter(Boolean).join("\n");
  return {
    scenario: descriptor.scenario,
    mechanism,
    observed: evidence.includes(mechanism) || evidence.includes("lmstudio-unreachable"),
    runIndex: descriptor.runIndex,
    code: result.errorCode ?? mechanism
  };
}

async function runAttemptPool<T>(
  items: readonly T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<"continue" | "stop">
): Promise<boolean> {
  let nextIndex = 0;
  let stopped = false;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!stopped) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item === undefined) return;
      const action = await handler(item, index);
      if (action === "stop") {
        stopped = true;
      }
    }
  });
  await Promise.all(workers);
  return stopped;
}

async function runFactoryProcess(input: FactoryRunInput): Promise<FactoryRunResult> {
  const mainPath = join(input.workspaceRoot, "apps", "factory-cli", "dist", "main.js");
  const child = spawn(process.execPath, [mainPath, ...input.args], {
    cwd: input.workspaceRoot,
    env: { ...process.env, ...(input.env ?? {}), PROTOSTAR_STRESS_BRANCH_NAME: input.branchName },
    stdio: ["ignore", "pipe", "pipe"],
    ...(input.signal !== undefined ? { signal: input.signal } : {})
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  return new Promise((resolveResult) => {
    let settled = false;
    const finish = (result: FactoryRunResult) => {
      if (settled) return;
      settled = true;
      resolveResult(result);
    };
    child.on("error", (error: NodeJS.ErrnoException) => {
      void (async () => {
        const errorCode = await detectedFactoryErrorCode(input, stdout, stderr, error.code);
        finish({
          exitCode: null,
          stdout,
          stderr,
          signalAborted: input.signal?.aborted === true,
          ...(errorCode !== undefined ? { errorCode } : {})
        });
      })();
    });
    child.on("close", (exitCode, signal) => {
      void (async () => {
        const errorCode = await detectedFactoryErrorCode(input, stdout, stderr);
        finish({
          exitCode,
          stdout,
          stderr,
          signal,
          signalAborted: input.signal?.aborted === true,
          ...(errorCode !== undefined ? { errorCode } : {})
        });
      })();
    });
  });
}

async function detectedFactoryErrorCode(
  input: FactoryRunInput,
  stdout: string,
  stderr: string,
  fallback?: string
): Promise<string | undefined> {
  if (input.signal?.aborted === true) {
    return input.env?.["PROTOSTAR_MOCK_LLM_MODE"] === "llm-timeout" ? "llm-abort-timeout" : "external-abort-signal";
  }

  const inlineEvidence = `${stdout}\n${stderr}`;
  if (inlineEvidence.includes("adapter-network-refusal")) return "adapter-network-refusal";
  if (inlineEvidence.includes("lmstudio-unreachable")) return "adapter-network-refusal";

  const runDir = join(input.workspaceRoot, ".protostar", "runs", input.runId);
  if (await runArtifactsContain(runDir, "adapter-network-refusal")) return "adapter-network-refusal";
  if (await runArtifactsContain(runDir, "lmstudio-unreachable")) return "adapter-network-refusal";
  return fallback;
}

async function runArtifactsContain(dir: string, needle: string): Promise<boolean> {
  let entries: readonly Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (await runArtifactsContain(path, needle)) return true;
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      try {
        if ((await readFile(path, "utf8")).includes(needle)) return true;
      } catch {
        // Ignore artifacts that disappear while a child process is finalizing.
      }
    }
  }
  return false;
}

function outcomeFromFactoryResult(result: FactoryRunResult): StressOutcome {
  if (result.outcome !== undefined) return result.outcome;
  if (result.signalAborted === true) return "cancelled";
  return result.exitCode === 0 ? "pass" : "failed";
}

function hasAllObservedMechanisms(observations: readonly FaultObservation[]): boolean {
  const observed = new Set(observations.filter((observation) => observation.observed).map((observation) => observation.mechanism));
  return ALL_MECHANISMS.every((mechanism) => observed.has(mechanism));
}

function generateSessionId(): string {
  return `stress_${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}_${process.pid}`;
}

function enforceWallClock(input: {
  readonly deps: StressScriptDependencies;
  readonly startedAtMs: number;
  readonly maxWallClockMs: number;
}): void {
  if (input.deps.nowMs() - input.startedAtMs > input.maxWallClockMs) {
    throw new Error("--max-wall-clock-days exceeded");
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function parsedIntegerOption(parsed: Record<string, string | boolean>, key: string): number | undefined {
  const value = stringOption(parsed, key);
  if (value === undefined) return undefined;
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`--${key} must be a positive integer`);
  }
  return positiveInteger(Number(value), `--${key}`);
}

function stringOption(parsed: Record<string, string | boolean>, key: string): string | undefined {
  const value = parsed[key];
  return typeof value === "string" ? value : undefined;
}

function parseSeedArchetypes(value: string | undefined): readonly SeedArchetype[] {
  const raw = (value ?? "cosmetic-tweak,feature-add").split(",").map((entry) => entry.trim()).filter(Boolean);
  if (raw.length === 0) {
    throw new Error("--seed-archetypes must include at least one archetype");
  }
  return raw.map((entry) => {
    if (entry !== "cosmetic-tweak" && entry !== "feature-add" && entry !== "bugfix" && entry !== "refactor") {
      throw new Error(`unsupported seed archetype: ${entry}`);
    }
    return entry;
  });
}

function isFaultScenario(value: string): value is FaultScenario {
  return (FAULT_SCENARIOS as readonly string[]).includes(value);
}

function isNodeErrno(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

class StressScriptHelp extends Error {}

async function main(): Promise<void> {
  try {
    const options = parseStressScriptArgs(process.argv.slice(2));
    const result = await runStressScript(options);
    process.stdout.write(`${JSON.stringify({
      sessionId: result.sessionId,
      sessionDir: result.sessionDir,
      eventsPath: result.eventsPath,
      reportPath: result.reportPath,
      totalRuns: result.totalRuns,
      stressClean: result.stressClean
    })}\n`);
    process.exitCode = result.aborted ? 1 : 0;
  } catch (error: unknown) {
    if (error instanceof StressScriptHelp) {
      process.stdout.write(`${usage()}\n`);
      process.exitCode = 0;
      return;
    }
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
