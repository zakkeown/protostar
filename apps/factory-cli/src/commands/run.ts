import { basename, resolve } from "node:path";

import { Command } from "@commander-js/extra-typings";
import { InvalidArgumentError } from "commander";
import type { IntentAmbiguityMode } from "@protostar/intent/ambiguity";
import type { HeadlessMode } from "@protostar/lmstudio-adapter";
import { resolveWorkspaceRoot } from "@protostar/paths";

import { parseGenerationArg, type PileMode, type TrustLevel } from "../cli-args.js";
import { ExitCode } from "../exit-codes.js";
import { writeStderr, writeStdoutJson } from "../io.js";
import {
  createLaunchRefusalRunId,
  runFactory,
  writeTwoKeyLaunchRefusalArtifacts,
  type RunCommandOptions
} from "../main.js";
import { validateTwoKeyLaunch } from "../two-key-launch.js";
import type { DeliveryMode } from "../load-factory-config.js";

export interface CommanderRunOptions {
  readonly allowedAdapters?: string;
  readonly confirmedIntent?: string;
  readonly confirmedIntentOutput?: string;
  readonly consensusJudgeModel?: string;
  readonly draft?: string;
  readonly deliveryMode?: DeliveryMode;
  readonly evolveCode?: boolean;
  readonly execCoordMode?: string;
  readonly executor?: string;
  readonly failTaskIds?: string;
  readonly generation?: string;
  readonly headlessMode?: HeadlessMode;
  readonly intent?: string;
  readonly intentDraft?: string;
  readonly intentMode?: string;
  readonly intentOutput?: string;
  readonly lineage?: string;
  readonly out?: string;
  readonly planningFixture?: string;
  readonly planningMode?: string;
  readonly reviewMode?: string;
  readonly runId?: string;
  readonly semanticJudgeModel?: string;
  readonly nonInteractive?: boolean;
  readonly trust?: string;
}

export function buildRunCommand(): Command {
  return new Command("run")
    .description("Run the Protostar factory loop")
    .option("--allowed-adapters <adapters>", "comma-separated execution adapter allowlist")
    .option("--confirmed-intent <path>", "trusted launch confirmed intent file")
    .option("--confirmed-intent-output <path>", "write normalized confirmed intent to confirmed-intent.json or intent.json")
    .option("--consensus-judge-model <model>", "override the consensus judge model")
    .option("--draft <path>", "intent draft JSON file")
    .option("--delivery-mode <mode>", "auto | gated (Phase 9 Q-20)", parseDeliveryModeOption)
    .option("--evolve-code", "include prior code hints in evolution context")
    .option("--exec-coord-mode <mode>", "execution-coordination pile mode: fixture or live")
    .option("--executor <mode>", "executor mode: dry-run or real")
    .option("--fail-task-ids <ids>", "comma-separated task ids to fail in dry-run mode")
    .option("--generation <n>", "evolution generation override")
    .option("--headless-mode <mode>", "github-hosted | self-hosted-runner | local-daemon", parseHeadlessModeOption)
    .option("--intent <path>", "unsupported legacy confirmed intent flag")
    .option("--intent-draft <path>", "intent draft JSON file")
    .option("--intent-mode <mode>", "intent ambiguity mode: greenfield or brownfield")
    .option("--intent-output <path>", "legacy alias for --confirmed-intent-output")
    .option("--lineage <id>", "evolution lineage id")
    .option("--out <dir>", "run output directory")
    .option("--planning-fixture <path>", "planning pile fixture path")
    .option("--planning-mode <mode>", "planning pile mode: fixture or live")
    .option("--review-mode <mode>", "review pile mode: fixture or live")
    .option("--run-id <id>", "explicit run id")
    .option("--semantic-judge-model <model>", "override the semantic judge model")
    .option("--non-interactive", "refuse instead of prompting in headless execution")
    .option("--trust <level>", "workspace trust: untrusted or trusted")
    .exitOverride()
    .configureOutput({
      writeOut: (str) => process.stderr.write(str),
      writeErr: (str) => process.stderr.write(str)
    })
    .action(async (opts) => {
      await executeRunCommand(opts);
    });
}

async function executeRunCommand(opts: CommanderRunOptions): Promise<void> {
  const parsed = buildRunOptions(opts);
  if (!parsed.ok) {
    writeStderr(parsed.error);
    process.exitCode = ExitCode.GenericError;
    return;
  }

  const twoKeyLaunch = validateTwoKeyLaunch({
    trust: parsed.options.trust ?? "untrusted",
    ...(parsed.options.confirmedIntent !== undefined ? { confirmedIntent: parsed.options.confirmedIntent } : {})
  });
  if (!twoKeyLaunch.ok) {
    const workspaceRoot = resolveWorkspaceRoot();
    const outDir = resolve(workspaceRoot, parsed.options.outDir);
    const runId = parsed.options.runId ?? createLaunchRefusalRunId();
    const runDir = resolve(outDir, runId);
    await writeTwoKeyLaunchRefusalArtifacts({
      runDir,
      outDir,
      runId,
      refusal: twoKeyLaunch.refusal
    });
    writeStderr(twoKeyLaunch.refusal.reason);
    process.exitCode = ExitCode.UsageOrArgError;
    return;
  }

  try {
    const result = await runFactory(parsed.options);
    writeStdoutJson(result.intent);
    process.exitCode = ExitCode.Success;
  } catch (error: unknown) {
    writeStderr(error instanceof Error ? error.message : String(error));
    process.exitCode = exitCodeFromError(error);
  }
}

export function buildRunOptions(opts: CommanderRunOptions):
  | { readonly ok: true; readonly options: RunCommandOptions }
  | { readonly ok: false; readonly error: string } {
  const draftPath = opts.intentDraft ?? opts.draft;
  if (opts.intent !== undefined) {
    return {
      ok: false,
      error:
        "The --intent flag is no longer supported. Provide an IntentDraft via --intent-draft <path> or --draft <path>; ConfirmedIntent values can only originate from the draft admission gate."
    };
  }
  if (!draftPath) {
    return { ok: false, error: "Missing required --intent-draft <path> or --draft <path>." };
  }
  if (!opts.out) {
    return { ok: false, error: "Missing required --out <dir>." };
  }

  const intentMode = parseIntentMode(opts.intentMode);
  if (!intentMode.ok) return { ok: false, error: intentMode.error };

  const confirmedIntentOutputPath = opts.confirmedIntentOutput ?? opts.intentOutput;
  const confirmedIntentOutputPathValidation = validateConfirmedIntentOutputPath(confirmedIntentOutputPath);
  if (!confirmedIntentOutputPathValidation.ok) {
    return { ok: false, error: confirmedIntentOutputPathValidation.error };
  }

  const executor = parseExecutor(opts.executor);
  if (!executor.ok) return { ok: false, error: executor.error };

  const trust = parseTrust(opts.trust);
  if (!trust.ok) return { ok: false, error: trust.error };

  const planningMode = parsePileMode("--planning-mode", opts.planningMode);
  if (!planningMode.ok) return { ok: false, error: planningMode.error };
  const reviewMode = parsePileMode("--review-mode", opts.reviewMode);
  if (!reviewMode.ok) return { ok: false, error: reviewMode.error };
  const execCoordMode = parsePileMode("--exec-coord-mode", opts.execCoordMode);
  if (!execCoordMode.ok) return { ok: false, error: execCoordMode.error };

  const generation = parseGeneration(opts.generation);
  if (!generation.ok) return { ok: false, error: generation.error };
  const allowedAdapters = parseAllowedAdapters(opts.allowedAdapters);

  return {
    ok: true,
    options: {
      intentDraftPath: draftPath,
      outDir: opts.out,
      planningFixturePath: opts.planningFixture ?? "examples/planning-results/scaffold.json",
      failTaskIds: parseFailTaskIds(opts.failTaskIds),
      intentMode: intentMode.mode,
      ...(confirmedIntentOutputPathValidation.path !== undefined
        ? { confirmedIntentOutputPath: confirmedIntentOutputPathValidation.path }
        : {}),
      ...(opts.confirmedIntent !== undefined ? { confirmedIntent: opts.confirmedIntent } : {}),
      ...(opts.runId !== undefined ? { runId: opts.runId } : {}),
      trust: trust.value,
      executor: executor.value,
      ...(allowedAdapters !== undefined ? { allowedAdapters } : {}),
      ...(planningMode.value !== undefined ? { planningMode: planningMode.value } : {}),
      ...(reviewMode.value !== undefined ? { reviewMode: reviewMode.value } : {}),
      ...(execCoordMode.value !== undefined ? { execCoordMode: execCoordMode.value } : {}),
      ...(opts.deliveryMode !== undefined ? { deliveryMode: opts.deliveryMode } : {}),
      ...(opts.lineage !== undefined ? { lineage: opts.lineage } : {}),
      ...(opts.evolveCode !== undefined ? { evolveCode: opts.evolveCode } : {}),
      ...(generation.value !== undefined ? { generation: generation.value } : {}),
      ...(opts.semanticJudgeModel !== undefined ? { semanticJudgeModel: opts.semanticJudgeModel } : {}),
      ...(opts.consensusJudgeModel !== undefined ? { consensusJudgeModel: opts.consensusJudgeModel } : {}),
      ...(opts.headlessMode !== undefined ? { headlessMode: opts.headlessMode } : {}),
      ...(opts.nonInteractive !== undefined ? { nonInteractive: opts.nonInteractive } : {})
    }
  };
}

function parseHeadlessModeOption(value: string): HeadlessMode {
  if (value === "github-hosted" || value === "self-hosted-runner" || value === "local-daemon") {
    return value;
  }
  throw new InvalidArgumentError("--headless-mode must be github-hosted, self-hosted-runner, or local-daemon.");
}

function parseDeliveryModeOption(value: string): DeliveryMode {
  if (value === "auto" || value === "gated") {
    return value;
  }
  throw new InvalidArgumentError("--delivery-mode must be auto or gated.");
}

function validateConfirmedIntentOutputPath(value: string | undefined):
  | {
      readonly ok: true;
      readonly path?: string;
    }
  | {
      readonly ok: false;
      readonly error: string;
    } {
  if (value === undefined) {
    return { ok: true };
  }

  const fileName = basename(value);
  if (fileName === "confirmed-intent.json" || fileName === "intent.json") {
    return {
      ok: true,
      path: value
    };
  }

  return {
    ok: false,
    error:
      "--confirmed-intent-output must point to confirmed-intent.json or intent.json so draft hardening cannot write ambiguous output files."
  };
}

function parseFailTaskIds(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim().length === 0) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseExecutor(value: string | undefined):
  | { readonly ok: true; readonly value: "dry-run" | "real" }
  | { readonly ok: false; readonly error: string } {
  if (value === undefined || value === "dry-run") {
    return { ok: true, value: "dry-run" };
  }
  if (value === "real") {
    return { ok: true, value: "real" };
  }
  return { ok: false, error: "--executor must be dry-run or real." };
}

function parseAllowedAdapters(value: string | undefined): readonly string[] | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseIntentMode(value: string | undefined):
  | {
      readonly ok: true;
      readonly mode: IntentAmbiguityMode;
    }
  | {
      readonly ok: false;
      readonly error: string;
    } {
  if (value === undefined) {
    return {
      ok: true,
      mode: "brownfield"
    };
  }
  if (value === "greenfield" || value === "brownfield") {
    return {
      ok: true,
      mode: value
    };
  }
  return {
    ok: false,
    error: "--intent-mode must be greenfield or brownfield."
  };
}

function parseTrust(value: string | undefined):
  | { readonly ok: true; readonly value: TrustLevel }
  | { readonly ok: false; readonly error: string } {
  if (value === undefined || value === "untrusted") {
    return { ok: true, value: "untrusted" };
  }
  if (value === "trusted") {
    return { ok: true, value: "trusted" };
  }
  return { ok: false, error: '--trust must be "untrusted" or "trusted".' };
}

function parsePileMode(flag: string, value: string | undefined):
  | { readonly ok: true; readonly value?: PileMode }
  | { readonly ok: false; readonly error: string } {
  if (value === undefined) {
    return { ok: true };
  }
  if (value === "fixture" || value === "live") {
    return { ok: true, value };
  }
  return { ok: false, error: `${flag} must be fixture or live.` };
}

function parseGeneration(value: string | undefined):
  | { readonly ok: true; readonly value?: number }
  | { readonly ok: false; readonly error: string } {
  if (value === undefined) {
    return { ok: true };
  }
  try {
    return { ok: true, value: parseGenerationArg(value) };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function exitCodeFromError(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "exitCode" in error &&
    typeof error.exitCode === "number"
  ) {
    return error.exitCode;
  }
  return ExitCode.GenericError;
}
