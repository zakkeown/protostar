import type {
  AdapterContext,
  AdapterEvent,
  AdapterResult,
  ExecutionAdapter
} from "@protostar/execution";
import {
  MECHANICAL_COMMAND_BINDINGS,
  type MechanicalCommandName,
  type RepoChangeSet
} from "@protostar/repo";
import type {
  MechanicalCheckCommandResult,
  MechanicalCheckResult,
  MechanicalScores,
  ReviewFinding
} from "@protostar/review";

import {
  acceptanceTestRefCoveredByMechanicalEvidence,
  buildFindings,
  buildMechanicalCommandTimeoutFinding,
  computeMechanicalScoresFromFindings,
  type MechanicalChecksArchetype,
  type MechanicalChecksPlanInput
} from "./findings.js";

/**
 * Phase 12 D-03/D-04: command config is a closed-enum name. Operators do not
 * supply argv — the runtime binds argv from the name via @protostar/repo's
 * MECHANICAL_COMMAND_BINDINGS table.
 */
export type MechanicalChecksCommandConfig = MechanicalCommandName;

export interface MechanicalChecksSubprocessRunner {
  runCommand(input: {
    readonly name: MechanicalCommandName;
    readonly cwd: string;
    readonly signal: AbortSignal;
    readonly timeoutMs: number;
  }): Promise<{
    readonly argv?: readonly string[];
    readonly exitCode: number;
    readonly durationMs?: number;
    readonly stdoutPath: string;
    readonly stderrPath: string;
    readonly stdoutTail?: string;
    readonly stderrTail?: string;
    readonly stdoutBytes?: number;
    readonly stderrBytes?: number;
  }>;
}

export interface MechanicalChecksAdapterConfig {
  readonly workspaceRoot: string;
  readonly commands: readonly MechanicalChecksCommandConfig[];
  readonly archetype: MechanicalChecksArchetype;
  readonly baseRef: string;
  readonly runId: string;
  readonly attempt: number;
  readonly plan: MechanicalChecksPlanInput;
  readonly readFile: (path: string) => Promise<string>;
  readonly diffNameOnly: readonly string[];
  readonly subprocess: MechanicalChecksSubprocessRunner;
}

export function createMechanicalChecksAdapter(config: MechanicalChecksAdapterConfig): ExecutionAdapter {
  return {
    id: "mechanical-checks",
    async *execute(_task, ctx): AsyncIterable<AdapterEvent> {
      yield { kind: "progress", message: "running mechanical commands" };
      const commandResults: MechanicalCheckCommandResult[] = [];
      const timeoutFindings: ReviewFinding[] = [];
      let testStdout = "";
      let collectedTestOutput = false;

      for (const name of commandsFor(config)) {
        const binding = MECHANICAL_COMMAND_BINDINGS[name];
        const argv = [binding.command, ...binding.args] as readonly string[];
        const startedAt = Date.now();
        try {
          const result = await config.subprocess.runCommand({
            name,
            cwd: config.workspaceRoot,
            signal: ctx.signal,
            timeoutMs: ctx.budget.taskWallClockMs
          });
          const commandResult: MechanicalCheckCommandResult = {
            id: name,
            argv: result.argv ?? argv,
            exitCode: result.exitCode,
            durationMs: result.durationMs ?? Date.now() - startedAt,
            stdoutPath: result.stdoutPath,
            stderrPath: result.stderrPath,
            ...(result.stdoutTail !== undefined ? { stdoutTail: result.stdoutTail } : {}),
            ...(result.stderrTail !== undefined ? { stderrTail: result.stderrTail } : {})
          };
          commandResults.push(commandResult);

          if (isTestOutputCommand(name)) {
            testStdout += await config.readFile(result.stdoutPath);
            collectedTestOutput = true;
          }

          yield {
            kind: "progress",
            message: `${name} exit=${result.exitCode} stdoutBytes=${result.stdoutBytes ?? 0} stderrBytes=${result.stderrBytes ?? 0}`
          };
        } catch (error) {
          if (isTimeoutError(error)) {
            commandResults.push({
              id: name,
              argv,
              exitCode: 124,
              durationMs: Date.now() - startedAt,
              stdoutPath: "",
              stderrPath: ""
            });
            timeoutFindings.push(buildMechanicalCommandTimeoutFinding({ commandId: name }));
            yield { kind: "progress", message: `${name} timeout` };
            continue;
          }
          throw error;
        }
      }

      const diffNameOnly = config.diffNameOnly;
      const findings = [
        ...timeoutFindings,
        ...buildFindings({
          commandResults,
          plan: config.plan,
          archetype: config.archetype,
          diffNameOnly,
          testStdout,
          evaluateAcceptanceCoverage: collectedTestOutput
        })
      ];
      const mechanicalScores = computeMechanicalScoresFromFindings({
        buildExitCode: commandResults.find((result) => isBuildScoreCommand(result.id))?.exitCode,
        lintExitCode: commandResults.find((result) => result.id.startsWith("lint"))?.exitCode,
        diffNameOnly,
        archetype: config.archetype,
        ...acceptanceCoverageCounts(config.plan, diffNameOnly, testStdout, commandResults, collectedTestOutput)
      });
      const evidence: MechanicalCheckResult & { readonly mechanicalScores: MechanicalScores } = {
        schemaVersion: "1.0.0",
        runId: config.runId,
        attempt: config.attempt,
        commands: commandResults,
        diffNameOnly,
        findings,
        mechanicalScores
      };
      const result: AdapterResult = {
        outcome: "change-set",
        changeSet: emptyChangeSet(config.workspaceRoot),
        evidence: evidence as unknown as AdapterResult["evidence"]
      };

      yield { kind: "final", result };
    }
  };
}

function commandsFor(config: MechanicalChecksAdapterConfig): readonly MechanicalCommandName[] {
  return config.commands;
}

function isTestOutputCommand(commandId: string): boolean {
  return commandId.includes("verify") || commandId.includes("test");
}

function isBuildScoreCommand(commandId: string): boolean {
  return commandId.startsWith("verify") || commandId.startsWith("build");
}

function acceptanceCoverageCounts(
  plan: MechanicalChecksPlanInput,
  diffNameOnly: readonly string[],
  testStdout: string,
  commandResults: readonly MechanicalCheckCommandResult[],
  enabled: boolean
): {
  readonly totalAcCount: number;
  readonly coveredAcCount: number;
} {
  if (!enabled) {
    return { totalAcCount: 0, coveredAcCount: 0 };
  }

  let totalAcCount = 0;
  let coveredAcCount = 0;

  for (const task of plan.tasks) {
    for (const ref of task.acceptanceTestRefs ?? []) {
      totalAcCount += 1;
      if (acceptanceTestRefCoveredByMechanicalEvidence({ ref, diffNameOnly, testStdout, commandResults })) {
        coveredAcCount += 1;
      }
    }
  }

  return { totalAcCount, coveredAcCount };
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "TimeoutError" ||
    error.message.toLowerCase().includes("timeout") ||
    error.message.toLowerCase().includes("timed out") ||
    ("reason" in error && error.reason === "timeout")
  );
}

function emptyChangeSet(workspaceRoot: string): RepoChangeSet {
  return {
    workspace: {
      root: workspaceRoot,
      trust: "trusted"
    },
    branch: "HEAD",
    patches: []
  };
}
