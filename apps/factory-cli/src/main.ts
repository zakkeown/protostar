#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { createFactoryRunManifest, recordStageArtifacts, setFactoryRunStatus } from "@protostar/artifacts";
import { createGitHubPrDeliveryPlan } from "@protostar/delivery";
import {
  assertPlanGraphFromPlanningPileResult,
  assertPlanningPileResult,
  buildPlanningMission,
  buildReviewMission
} from "@protostar/dogpile-adapter";
import { createEvaluationReport, decideEvolution, type OntologySnapshot } from "@protostar/evaluation";
import { prepareExecutionRun, type ExecutionDryRunResult } from "@protostar/execution";
import {
  assertConfirmedIntent,
  assertIntentAmbiguityAccepted,
  assessConfirmedIntentAmbiguity,
  type ConfirmedIntent,
  type IntentAmbiguityMode
} from "@protostar/intent";
import { authorizeFactoryStart } from "@protostar/policy";
import type { PlanGraph } from "@protostar/planning";
import { defineWorkspace } from "@protostar/repo";
import { runMechanicalReviewExecutionLoop, type ReviewVerdict } from "@protostar/review";

interface RunCommandOptions {
  readonly intentPath: string;
  readonly outDir: string;
  readonly planningFixturePath: string;
  readonly failTaskIds: readonly string[];
  readonly intentMode: IntentAmbiguityMode;
  readonly runId?: string;
}

interface RunCommandResult {
  readonly runId: string;
  readonly runDir: string;
  readonly artifacts: readonly string[];
}

async function main(): Promise<void> {
  const command = parseArgs(process.argv.slice(2));

  if (command.type === "help") {
    console.log(helpText());
    return;
  }

  if (command.type === "error") {
    console.error(command.message);
    console.error("");
    console.error(helpText());
    process.exitCode = 1;
    return;
  }

  const result = await runFactory(command.options);
  console.log(JSON.stringify(result, null, 2));
}

async function runFactory(options: RunCommandOptions): Promise<RunCommandResult> {
  const workspaceRoot = process.env["INIT_CWD"] ?? process.cwd();
  const intentPath = resolve(workspaceRoot, options.intentPath);
  const planningFixturePath = resolve(workspaceRoot, options.planningFixturePath);
  const outDir = resolve(workspaceRoot, options.outDir);
  const intent = assertConfirmedIntent(JSON.parse(await readFile(intentPath, "utf8")));
  const ambiguityAssessment = assertIntentAmbiguityAccepted(
    assessConfirmedIntentAmbiguity(intent, {
      mode: options.intentMode
    })
  );
  const planningPileResult = assertPlanningPileResult(JSON.parse(await readFile(planningFixturePath, "utf8")));
  const runId = options.runId ?? createRunId(intent.id);
  const runDir = resolve(outDir, runId);

  const policyVerdict = authorizeFactoryStart(intent, {
    allowDarkRun: true,
    maxAutonomousRisk: "medium",
    requiredHumanCheckpoints: []
  });

  if (policyVerdict.type !== "allow") {
    throw new Error(`Factory run refused by policy: ${policyVerdict.rationale}`);
  }

  const manifest = createFactoryRunManifest({
    runId,
    intentId: intent.id
  });
  const plan = assertPlanGraphFromPlanningPileResult(planningPileResult, {
    intentId: intent.id,
    defaultPlanId: `plan_${runId}`
  });
  const workspace = defineWorkspace({
    root: workspaceRoot,
    trust: "trusted",
    defaultBranch: "main"
  });
  const execution = prepareExecutionRun({
    runId: manifest.runId,
    plan,
    workspace
  });
  const loop = runMechanicalReviewExecutionLoop({
    intent,
    plan,
    execution,
    initialFailTaskIds: options.failTaskIds,
    maxRepairLoops: intent.capabilityEnvelope.budget.maxRepairLoops ?? 0
  });
  const executionResult = loop.finalExecutionResult;
  const review = loop.finalReviewGate;
  const evaluationReport = createEvaluationReport({
    runId,
    reviewGate: review
  });
  const evolutionDecision = decideEvolution({
    previous: createIntentOntologySnapshot(intent),
    current: createPlanOntologySnapshot(plan)
  });
  const deliveryPlan = createGitHubPrDeliveryPlan({
    runId,
    reviewGate: review,
    title: intent.title
  });
  const planningMission = buildPlanningMission(intent);
  const reviewMission = buildReviewMission(intent, plan);
  const startedAt = new Date().toISOString();
  const finalManifest = [
    {
      stage: "intent" as const,
      status: "passed" as const,
      artifacts: [
        artifact("intent", "confirmed-intent", "intent.json", "Normalized confirmed intent input."),
        artifact("intent", "intent-ambiguity", "intent-ambiguity.json", "Ouroboros-style intent ambiguity assessment.")
      ]
    },
    {
      stage: "planning" as const,
      status: "passed" as const,
      artifacts: [
        artifact("planning", "pile-mission", "planning-mission.txt", "Model-visible planning pile mission."),
        artifact("planning", "pile-result", "planning-result.json", "Raw structured planning pile result."),
        artifact("planning", "plan-graph", "plan.json", "Plan graph parsed and validated from the planning pile result.")
      ]
    },
    {
      stage: "execution" as const,
      status: executionResult.status === "passed" ? ("passed" as const) : ("failed" as const),
      artifacts: [
        artifact("execution", "execution-plan", "execution-plan.json", "Execution task ordering derived from the plan graph."),
        artifact("execution", "execution-events", "execution-events.json", "Dry-run execution lifecycle events."),
        artifact("execution", "execution-result", "execution-result.json", "Dry-run execution result."),
        artifact("execution", "review-execution-loop", "review-execution-loop.json", "Review-execute-review loop transcript."),
        ...executionResult.evidence
      ]
    },
    {
      stage: "review" as const,
      status: review.verdict === "pass" ? ("passed" as const) : ("failed" as const),
      artifacts: [
        artifact("review", "pile-mission", "review-mission.txt", "Model-visible review pile mission."),
        artifact("review", "review-gate", "review-gate.json", "Mechanical review verdict and findings."),
        artifact("review", "evaluation-report", "evaluation-report.json", "Three-stage evaluation report stub."),
        artifact("review", "evolution-decision", "evolution-decision.json", "Ontology convergence decision stub.")
      ]
    },
    {
      stage: "release" as const,
      status: deliveryPlan.status === "ready" ? ("passed" as const) : ("skipped" as const),
      artifacts: deliveryPlan.artifacts
    }
  ].reduce(
    (current, stage) =>
      recordStageArtifacts(current, {
        ...stage,
        startedAt,
        ...(stage.status === "passed" || stage.status === "failed" || stage.status === "skipped"
          ? { completedAt: startedAt }
          : {})
      }),
    manifest
  );
  const reviewedManifest = setFactoryRunStatus(finalManifest, statusForReviewVerdict(review.verdict));

  await mkdir(runDir, { recursive: true });
  await mkdir(resolve(runDir, "delivery"), { recursive: true });
  await writeJson(resolve(runDir, "intent.json"), intent);
  await writeJson(resolve(runDir, "intent-ambiguity.json"), ambiguityAssessment);
  await writeJson(resolve(runDir, "manifest.json"), reviewedManifest);
  await writeFile(resolve(runDir, "planning-mission.txt"), `${planningMission.intent}\n`, "utf8");
  await writeFile(resolve(runDir, "review-mission.txt"), `${reviewMission.intent}\n`, "utf8");
  await writeJson(resolve(runDir, "planning-result.json"), planningPileResult);
  await writeJson(resolve(runDir, "plan.json"), plan);
  await writeJson(resolve(runDir, "execution-plan.json"), execution);
  await writeJson(resolve(runDir, "execution-events.json"), executionResult.events);
  await writeJson(resolve(runDir, "execution-result.json"), executionResult);
  await writeJson(resolve(runDir, "review-execution-loop.json"), loop);
  await writeExecutionEvidence(runDir, executionResult);
  await writeJson(resolve(runDir, "review-gate.json"), review);
  await writeJson(resolve(runDir, "evaluation-report.json"), evaluationReport);
  await writeJson(resolve(runDir, "evolution-decision.json"), evolutionDecision);
  await writeJson(resolve(runDir, "delivery-plan.json"), deliveryPlan);
  await writeFile(resolve(runDir, "delivery/pr-body.md"), `${deliveryPlan.body}\n`, "utf8");

  return {
    runId,
    runDir,
    artifacts: [
      "intent.json",
      "intent-ambiguity.json",
      "manifest.json",
      "planning-mission.txt",
      "planning-result.json",
      "review-mission.txt",
      "plan.json",
      "execution-plan.json",
      "execution-events.json",
      "execution-result.json",
      "review-execution-loop.json",
      ...executionResult.evidence.map((ref) => ref.uri),
      "review-gate.json",
      "evaluation-report.json",
      "evolution-decision.json",
      "delivery-plan.json",
      "delivery/pr-body.md"
    ]
  };
}

function createIntentOntologySnapshot(intent: ConfirmedIntent): OntologySnapshot {
  return {
    generation: 0,
    fields: intent.acceptanceCriteria.map((criterion) => ({
      name: criterion.id,
      type: criterion.verification,
      description: criterion.statement
    }))
  };
}

function createPlanOntologySnapshot(plan: PlanGraph): OntologySnapshot {
  return {
    generation: 1,
    fields: plan.tasks.flatMap((task) =>
      task.covers.map((criterionId) => ({
        name: criterionId,
        type: task.kind,
        description: task.title
      }))
    )
  };
}

function artifact(
  stage: Parameters<typeof recordStageArtifacts>[1]["stage"],
  kind: string,
  uri: string,
  description: string
) {
  return {
    stage,
    kind,
    uri,
    description
  };
}

function statusForReviewVerdict(verdict: ReviewVerdict) {
  if (verdict === "pass") {
    return "ready-to-release";
  }
  if (verdict === "repair") {
    return "repairing";
  }
  return "blocked";
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeExecutionEvidence(runDir: string, result: ExecutionDryRunResult): Promise<void> {
  const evidenceDir = resolve(runDir, "execution-evidence");
  await mkdir(evidenceDir, { recursive: true });
  await Promise.all(
    result.tasks.flatMap((task) =>
      task.evidence.map((ref) =>
        writeJson(resolve(runDir, ref.uri), {
          planTaskId: task.planTaskId,
          status: task.status,
          reason: task.reason ?? null,
          blockedBy: task.blockedBy ?? [],
          evidence: ref
        })
      )
    )
  );
}

function createRunId(intentId: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const intentSuffix = intentId.replace(/^intent_/, "").replace(/[^a-zA-Z0-9_]+/g, "_").slice(0, 48);
  return `run_${timestamp}_${intentSuffix}`;
}

type ParsedArgs =
  | {
      readonly type: "run";
      readonly options: RunCommandOptions;
    }
  | {
      readonly type: "help";
    }
  | {
      readonly type: "error";
      readonly message: string;
    };

function parseArgs(args: readonly string[]): ParsedArgs {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  const [command, ...rest] = normalizedArgs;

  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return { type: "help" };
  }

  if (command !== "run") {
    return {
      type: "error",
      message: `Unknown command: ${command}`
    };
  }

  const flags = parseFlags(rest);
  if (typeof flags === "string") {
    return {
      type: "error",
      message: flags
    };
  }

  if (!flags.intent) {
    return {
      type: "error",
      message: "Missing required --intent <path>."
    };
  }
  if (!flags.out) {
    return {
      type: "error",
      message: "Missing required --out <dir>."
    };
  }
  const intentMode = parseIntentMode(flags.intentMode);
  if (!intentMode.ok) {
    return {
      type: "error",
      message: intentMode.error
    };
  }

  return {
    type: "run",
    options: {
      intentPath: flags.intent,
      outDir: flags.out,
      planningFixturePath: flags.planningFixture ?? "examples/planning-results/scaffold.json",
      failTaskIds: parseFailTaskIds(flags.failTaskIds),
      intentMode: intentMode.mode,
      ...(flags.runId !== undefined ? { runId: flags.runId } : {})
    }
  };
}

function parseFlags(args: readonly string[]): Record<string, string | undefined> | string {
  const flags: Record<string, string | undefined> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (!arg.startsWith("--")) {
      return `Unexpected positional argument: ${arg}`;
    }

    const name = flagName(arg);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return `Missing value for ${arg}.`;
    }
    flags[name] = value;
    index += 1;
  }

  return flags;
}

function flagName(flag: string): string {
  return flag.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
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

function helpText(): string {
  const executable = basename(process.argv[1] ?? "protostar-factory");
  return [
    "Protostar Factory",
    "",
    "Commands:",
    `  ${executable} run --intent <path> --out <dir> [--planning-fixture <path>] [--intent-mode <mode>] [--fail-task-ids <ids>] [--run-id <id>]`,
    "",
    "Example:",
    `  ${executable} run --intent examples/intents/scaffold.json --out .protostar/runs --planning-fixture examples/planning-results/scaffold.json`
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
