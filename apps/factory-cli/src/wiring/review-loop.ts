import type { AdapterContext, ExecutionAdapter, ExecutionAdapterTaskInput } from "@protostar/execution";
import { createMechanicalChecksAdapter, type MechanicalChecksAdapterConfig, type MechanicalChecksCommandConfig, type MechanicalChecksSubprocessRunner } from "@protostar/mechanical-checks";
import type { AdmittedPlanExecutionArtifact, ExecutionRunResult } from "@protostar/planning";
import type { FsAdapter } from "@protostar/repo";
import { createLmstudioJudgeAdapter, type ResolvedFactoryConfig } from "@protostar/lmstudio-adapter";
import {
  createReviewGate,
  createReviewPersistence,
  runReviewRepairLoop,
  type MechanicalCheckResult,
  type MechanicalChecker,
  type ModelReviewer,
  type ReviewPersistence,
  type ReviewRepairLoopInput,
  type ReviewRepairLoopResult,
  type TaskExecutorService
} from "@protostar/review";
import type { ConfirmedIntent } from "@protostar/intent";

export type ReviewLoopArchetype = "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";

export interface ReviewLoopFsAdapter extends FsAdapter {
  readFile(path: string): Promise<string>;
}

export interface BuildReviewRepairServicesInput {
  readonly fs: ReviewLoopFsAdapter;
  readonly gitFs: MechanicalChecksAdapterConfig["gitFs"];
  readonly runsRoot: string;
  readonly workspaceRoot: string;
  readonly factoryConfig: ResolvedFactoryConfig;
  readonly archetype: ReviewLoopArchetype;
  readonly admittedPlan: AdmittedPlanExecutionArtifact;
  readonly runId: string;
  readonly baseRef: string;
  readonly executor: TaskExecutorService;
  readonly subprocess: MechanicalChecksSubprocessRunner;
  readonly mechanicalChecksFactory?: (config: MechanicalChecksAdapterConfig) => ExecutionAdapter;
  readonly judgeFactory?: (config: {
    readonly baseUrl: string;
    readonly model: string;
    readonly apiKeyEnv?: string;
    readonly judgeId: string;
    readonly timeoutMs: number;
  }) => ModelReviewer;
}

export function buildReviewRepairServices(input: BuildReviewRepairServicesInput): {
  readonly mechanicalChecker: MechanicalChecker;
  readonly modelReviewer: ModelReviewer;
  readonly persistence: ReviewPersistence;
} {
  const createAdapter = input.mechanicalChecksFactory ?? createMechanicalChecksAdapter;
  const createJudge = input.judgeFactory ?? createLmstudioJudgeAdapter;
  // Construct once at build time so factory wiring failures surface before the
  // loop starts. Per-attempt calls below create a fresh adapter with the real attempt.
  createAdapter(mechanicalAdapterConfig(input, 0));

  return {
    mechanicalChecker: async (checkInput) => {
      const adapter = createAdapter(mechanicalAdapterConfig(input, checkInput.attempt));
      const final = await finalMechanicalResult(adapter, input, checkInput.attempt);
      return {
        result: final,
        gate: createReviewGate({
          admittedPlan: input.admittedPlan,
          execution: {
            runId: checkInput.runId,
            planId: input.admittedPlan.planId,
            admittedPlan: input.admittedPlan.evidence,
            workspace: { root: input.workspaceRoot, trust: "trusted" },
            tasks: input.admittedPlan.tasks.map((task) => ({
              planTaskId: task.planTaskId,
              title: task.title,
              status: "pending",
              dependsOn: task.dependsOn,
              ...(task.targetFiles !== undefined ? { targetFiles: task.targetFiles } : {}),
              ...(task.adapterRef !== undefined ? { adapterRef: task.adapterRef } : {})
            }))
          },
          findings: final.findings
        })
      };
    },
    modelReviewer: createJudge({
      baseUrl: judgeConfig(input.factoryConfig).baseUrl,
      model: judgeConfig(input.factoryConfig).model,
      apiKeyEnv: judgeConfig(input.factoryConfig).apiKeyEnv,
      judgeId: "qwen3-80b-judge-1",
      timeoutMs: 60_000
    }),
    persistence: createReviewPersistence({ fs: input.fs, runsRoot: input.runsRoot })
  };
}

export async function runReviewRepairLoopWithDurablePersistence(
  input: BuildReviewRepairServicesInput & {
    readonly confirmedIntent: ConfirmedIntent;
    readonly initialExecution: ExecutionRunResult;
  }
): Promise<ReviewRepairLoopResult> {
  const services = buildReviewRepairServices(input);
  return runReviewRepairLoop({
    runId: input.runId,
    confirmedIntent: input.confirmedIntent,
    admittedPlan: input.admittedPlan,
    initialExecution: input.initialExecution,
    executor: input.executor,
    mechanicalChecker: services.mechanicalChecker,
    modelReviewer: services.modelReviewer,
    persistence: services.persistence
  } satisfies ReviewRepairLoopInput);
}

export function defaultMechanicalCommandsForArchetype(
  archetype: ReviewLoopArchetype
): readonly MechanicalChecksCommandConfig[] {
  if (archetype === "cosmetic-tweak") {
    return [
      { id: "verify", argv: ["pnpm", "verify"] },
      { id: "lint", argv: ["pnpm", "lint"] }
    ];
  }
  return [{ id: "verify", argv: ["pnpm", "verify"] }];
}

function mechanicalAdapterConfig(
  input: BuildReviewRepairServicesInput,
  attempt: number
): MechanicalChecksAdapterConfig {
  return {
    workspaceRoot: input.workspaceRoot,
    commands: configuredMechanicalCommands(input.factoryConfig) ?? defaultMechanicalCommandsForArchetype(input.archetype),
    archetype: input.archetype,
    baseRef: input.baseRef,
    runId: input.runId,
    attempt,
    plan: input.admittedPlan,
    readFile: input.fs.readFile,
    gitFs: input.gitFs,
    subprocess: input.subprocess
  };
}

async function finalMechanicalResult(
  adapter: ExecutionAdapter,
  input: BuildReviewRepairServicesInput,
  attempt: number
): Promise<MechanicalCheckResult> {
  for await (const event of adapter.execute(mechanicalTask(input.admittedPlan), adapterContext(input, attempt))) {
    if (event.kind === "final") {
      return event.result.evidence as unknown as MechanicalCheckResult;
    }
  }
  throw new Error("mechanical-checks adapter completed without a final event.");
}

function mechanicalTask(admittedPlan: AdmittedPlanExecutionArtifact): ExecutionAdapterTaskInput {
  return {
    planTaskId: "mechanical-review",
    title: "Mechanical review",
    targetFiles: admittedPlan.tasks.flatMap((task) => task.targetFiles ?? [])
  };
}

function adapterContext(input: BuildReviewRepairServicesInput, attempt: number) {
  return {
    signal: new AbortController().signal,
    confirmedIntent: {
      capabilityEnvelope: {
        budget: {
          taskWallClockMs: 60_000,
          adapterRetriesPerTask: 0,
          maxRepairLoops: 0
        }
      }
    },
    resolvedEnvelope: {
      budget: {
        taskWallClockMs: 60_000,
        adapterRetriesPerTask: 0,
        maxRepairLoops: 0
      }
    },
    repoReader: {
      async readFile(path: string) {
        return { bytes: new TextEncoder().encode(await input.fs.readFile(path)), sha256: "" };
      },
      async glob() {
        return [];
      }
    },
    journal: {
      async appendToken() {}
    },
    budget: {
      taskWallClockMs: 60_000,
      adapterRetriesPerTask: 0
    },
    network: {
      allow: "loopback"
    },
    repairContext: {
      previousAttempt: {
        runId: input.runId,
        attempt,
        adapterId: "mechanical-checks"
      },
      mechanicalCritiques: []
    }
  } as unknown as AdapterContext;
}

function configuredMechanicalCommands(
  factoryConfig: ResolvedFactoryConfig
): readonly MechanicalChecksCommandConfig[] | undefined {
  const config = factoryConfig.config as unknown as {
    readonly mechanicalChecks?: {
      readonly commands?: readonly MechanicalChecksCommandConfig[];
    };
  };
  return config.mechanicalChecks?.commands;
}

function judgeConfig(factoryConfig: ResolvedFactoryConfig) {
  const judge = factoryConfig.config.adapters.judge;
  if (judge === undefined) {
    throw new Error("factoryConfig.adapters.judge is required for review loop wiring.");
  }
  return judge;
}
