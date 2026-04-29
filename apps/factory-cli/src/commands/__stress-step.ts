import { Command } from "@commander-js/extra-typings";
import { StressShapeSchema, StressOutcomeSchema } from "@protostar/artifacts";
import type { SeedArchetype } from "@protostar/fixtures";
import { resolveWorkspaceRoot } from "@protostar/paths";
import { z } from "zod";

import { ExitCode } from "../exit-codes.js";
import { writeStderr, writeStdoutJson } from "../io.js";
import {
  materializeStressDraft,
  prepareStressRunInput,
  selectNextStressSeed,
  signStressConfirmedIntent
} from "../stress/seed-materialization.js";
import { type StressCapShape, type StressCapSource } from "../stress/stress-caps.js";
import {
  appendStressEvent,
  beginStressSession,
  finalizeStressSession,
  recordStressRun,
  resolveStressSessionPaths,
  writeCapBreach,
  writeWedgeEvidence
} from "../stress/stress-session.js";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

interface StressStepOptions {
  readonly action?: string;
  readonly archetype?: string;
  readonly capKind?: string;
  readonly capLimit?: string;
  readonly capSource?: string;
  readonly capValue?: string;
  readonly ciVerdict?: string;
  readonly draft?: string;
  readonly durationMs?: string;
  readonly eventType?: string;
  readonly faultInjected?: string;
  readonly headlessMode?: string;
  readonly idleMs?: string;
  readonly json?: boolean;
  readonly llmBackend?: string;
  readonly outcome?: string;
  readonly p95Ms?: string;
  readonly payloadJson?: string;
  readonly prUrl?: string;
  readonly runId?: string;
  readonly runIndex?: string;
  readonly seedArchetypes?: string;
  readonly seedId?: string;
  readonly session?: string;
  readonly shape?: string;
}

const ActionSchema = z.enum([
  "begin",
  "next-seed",
  "materialize-draft",
  "sign-intent",
  "record-run",
  "append-event",
  "finalize",
  "cap-breach",
  "wedge"
]);
const SessionSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/, "session must be path-safe");
const StressCapShapeSchema = z.enum(["sustained-load", "concurrency", "fault-injection", "ttt-delivery"]);
const SeedArchetypeSchema = z.enum(["cosmetic-tweak", "feature-add", "bugfix", "refactor"]);

export function buildStressStepCommand(): Command {
  const command = new Command("__stress-step")
    .description("Internal stress session stepper")
    .requiredOption("--session <sessionId>", "stress session id")
    .requiredOption("--action <action>", "action to execute")
    .option("--shape <shape>", "stress shape")
    .option("--json", "emit structured JSON for actions that support it")
    .option("--seed-archetypes <csv>", "seed archetypes for next-seed/materialize-draft")
    .option("--seed-id <id>", "optional exact seed id")
    .option("--run-index <n>", "zero-based stress run index")
    .option("--run-id <id>", "factory run id")
    .option("--draft <path>", "draft path for sign-intent")
    .option("--event-type <type>", "event type for append-event")
    .option("--payload-json <json>", "event payload object for append-event")
    .option("--archetype <name>", "run archetype for record-run")
    .option("--outcome <outcome>", "run outcome for record-run")
    .option("--duration-ms <ms>", "run duration for record-run")
    .option("--pr-url <url>", "optional PR URL for record-run")
    .option("--ci-verdict <verdict>", "optional CI verdict for record-run")
    .option("--fault-injected <name>", "optional fault scenario for record-run")
    .option("--headless-mode <mode>", "headless mode for finalize")
    .option("--llm-backend <backend>", "LLM backend for finalize")
    .option("--cap-kind <kind>", "cap breach kind")
    .option("--cap-value <value>", "cap breach value")
    .option("--cap-limit <limit>", "cap breach limit")
    .option("--cap-source <source>", "cap source")
    .option("--p95-ms <ms>", "p95 successful duration for wedge evidence")
    .option("--idle-ms <ms>", "idle duration for wedge evidence")
    .exitOverride()
    .configureOutput({
      writeOut: (str) => process.stderr.write(str),
      writeErr: (str) => process.stderr.write(str)
    })
    .action(async (opts) => {
      process.exitCode = await executeStressStep(opts);
    });
  return command as unknown as Command;
}

async function executeStressStep(opts: StressStepOptions): Promise<number> {
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
    const paths = resolveStressSessionPaths(workspaceRoot, parsed.data.session);
    switch (parsed.data.action) {
      case "begin": {
        const shape = StressShapeSchema.parse(required(opts.shape, "--shape"));
        const cursor = await beginStressSession({ paths, shape });
        writeJsonIfRequested(opts, { sessionId: cursor.sessionId, cursorPath: paths.cursorPath });
        return ExitCode.Success;
      }
      case "next-seed": {
        const selection = selectNextStressSeed({
          seedArchetypes: parseSeedArchetypes(opts.seedArchetypes),
          ...(opts.seedId !== undefined ? { seedId: opts.seedId } : {}),
          runIndex: parseNonnegativeInteger(opts.runIndex, "--run-index")
        });
        writeJsonIfRequested(opts, {
          seedId: selection.seedId,
          archetype: selection.archetype,
          runIndex: selection.runIndex,
          selectedIndex: selection.selectedIndex,
          strategy: selection.strategy
        });
        return ExitCode.Success;
      }
      case "materialize-draft": {
        const selection = selectNextStressSeed({
          seedArchetypes: parseSeedArchetypes(opts.seedArchetypes),
          ...(opts.seedId !== undefined ? { seedId: opts.seedId } : {}),
          runIndex: parseNonnegativeInteger(opts.runIndex, "--run-index")
        });
        const result = await materializeStressDraft({
          workspaceRoot,
          sessionId: parsed.data.session,
          runId: required(opts.runId, "--run-id"),
          selection
        });
        writeJsonIfRequested(opts, result);
        return ExitCode.Success;
      }
      case "sign-intent": {
        const result = await signStressConfirmedIntent({
          workspaceRoot,
          sessionId: parsed.data.session,
          runId: required(opts.runId, "--run-id"),
          ...(opts.draft !== undefined ? { draftPath: opts.draft } : {})
        });
        writeJsonIfRequested(opts, result);
        return ExitCode.Success;
      }
      case "record-run": {
        const run = {
          runId: required(opts.runId, "--run-id"),
          seedId: required(opts.seedId, "--seed-id"),
          archetype: required(opts.archetype, "--archetype"),
          outcome: StressOutcomeSchema.parse(required(opts.outcome, "--outcome")),
          durationMs: parseNonnegativeInteger(opts.durationMs, "--duration-ms"),
          ...(opts.prUrl !== undefined && opts.prUrl.length > 0 ? { prUrl: opts.prUrl } : {}),
          ...(opts.ciVerdict !== undefined && opts.ciVerdict.length > 0 ? { ciVerdict: opts.ciVerdict as "success" | "failure" | "timeout" | "skipped" } : {}),
          ...(opts.faultInjected !== undefined && opts.faultInjected.length > 0 ? { faultInjected: opts.faultInjected } : {})
        };
        const cursor = await recordStressRun({ paths, run });
        writeJsonIfRequested(opts, { completed: cursor.completed, cursorPath: paths.cursorPath });
        return ExitCode.Success;
      }
      case "append-event": {
        const event = await appendStressEvent({
          paths,
          type: required(opts.eventType, "--event-type"),
          payload: parsePayload(opts.payloadJson)
        });
        writeJsonIfRequested(opts, event);
        return ExitCode.Success;
      }
      case "finalize": {
        const report = await finalizeStressSession({
          paths,
          headlessMode: required(opts.headlessMode, "--headless-mode"),
          llmBackend: required(opts.llmBackend, "--llm-backend")
        });
        writeJsonIfRequested(opts, { reportPath: paths.reportPath, totalRuns: report.totalRuns });
        return ExitCode.Success;
      }
      case "cap-breach": {
        const artifact = await writeCapBreach({
          paths,
          breach: {
            kind: z.enum(["run-count", "wall-clock"]).parse(required(opts.capKind, "--cap-kind")),
            value: parseFiniteNumber(opts.capValue, "--cap-value"),
            limit: parseFiniteNumber(opts.capLimit, "--cap-limit"),
            shape: StressCapShapeSchema.parse(required(opts.shape, "--shape")) as StressCapShape
          },
          capSource: z.enum(["cli", "factory.stress.caps", "q03-default"]).parse(required(opts.capSource, "--cap-source")) as StressCapSource
        });
        writeJsonIfRequested(opts, { capBreachPath: paths.capBreachPath, breach: artifact.breach });
        return ExitCode.Success;
      }
      case "wedge": {
        const now = new Date().toISOString();
        const artifact = await writeWedgeEvidence({
          paths,
          evidence: {
            runId: required(opts.runId, "--run-id"),
            detectedAt: now,
            p95SuccessfulDurationMs: parseFiniteNumber(opts.p95Ms, "--p95-ms"),
            idleDurationMs: parseFiniteNumber(opts.idleMs, "--idle-ms"),
            reason: "status unchanged for > 5x p95"
          }
        });
        writeJsonIfRequested(opts, { wedgeEvidencePath: paths.wedgeEvidencePath, runId: artifact.runId });
        return ExitCode.Success;
      }
    }
  } catch (error: unknown) {
    writeStderr(error instanceof Error ? error.message : String(error));
    return ExitCode.GenericError;
  }
}

function parseSeedArchetypes(input: string | undefined): readonly SeedArchetype[] {
  const values = required(input, "--seed-archetypes").split(",").map((entry) => entry.trim()).filter(Boolean);
  if (values.length === 0) {
    throw new Error("--seed-archetypes must include at least one archetype");
  }
  return values.map((value) => SeedArchetypeSchema.parse(value));
}

function parsePayload(input: string | undefined): Record<string, JsonValue> {
  const parsed = JSON.parse(input ?? "{}") as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("--payload-json must be a JSON object");
  }
  assertJsonValue(parsed);
  return parsed as Record<string, JsonValue>;
}

function parseNonnegativeInteger(input: string | undefined, name: string): number {
  if (input === undefined || !/^[0-9]+$/.test(input)) {
    throw new Error(`${name} must be a nonnegative integer`);
  }
  return Number(input);
}

function parseFiniteNumber(input: string | undefined, name: string): number {
  if (input === undefined || input.length === 0) {
    throw new Error(`${name} is required`);
  }
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a nonnegative finite number`);
  }
  return value;
}

function required(input: string | undefined, name: string): string {
  if (input === undefined || input.length === 0) {
    throw new Error(`${name} is required`);
  }
  return input;
}

function writeJsonIfRequested(opts: StressStepOptions, value: unknown): void {
  if (opts.json === true) {
    writeStdoutJson(value);
  }
}

function assertJsonValue(value: unknown): asserts value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertJsonValue);
    return;
  }
  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach(assertJsonValue);
    return;
  }
  throw new Error("--payload-json must contain only JSON values");
}
