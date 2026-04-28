import type {
  AdapterContext,
  AdapterEvent,
  AdapterResult,
  ExecutionAdapter
} from "@protostar/execution";
import type { FsClient } from "isomorphic-git";
import type { RepoChangeSet } from "@protostar/repo";
import type { MechanicalCheckCommandResult, MechanicalCheckResult, ReviewFinding } from "@protostar/review";

import { computeDiffNameOnly } from "./diff-name-only.js";
import {
  buildFindings,
  buildMechanicalCommandTimeoutFinding,
  type MechanicalChecksArchetype,
  type MechanicalChecksPlanInput
} from "./findings.js";

export interface MechanicalChecksCommandConfig {
  readonly id: string;
  readonly argv: readonly string[];
  readonly cwd?: string;
}

export interface MechanicalChecksSubprocessRunner {
  runCommand(input: {
    readonly argv: readonly string[];
    readonly cwd: string;
    readonly signal: AbortSignal;
    readonly timeoutMs: number;
  }): Promise<{
    readonly argv?: readonly string[];
    readonly exitCode: number;
    readonly durationMs?: number;
    readonly stdoutPath: string;
    readonly stderrPath: string;
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
  readonly gitFs: FsClient;
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

      for (const command of commandsFor(config)) {
        const startedAt = Date.now();
        try {
          const result = await config.subprocess.runCommand({
            argv: command.argv,
            cwd: command.cwd ?? config.workspaceRoot,
            signal: ctx.signal,
            timeoutMs: ctx.budget.taskWallClockMs
          });
          const commandResult: MechanicalCheckCommandResult = {
            id: command.id,
            argv: result.argv ?? command.argv,
            exitCode: result.exitCode,
            durationMs: result.durationMs ?? Date.now() - startedAt,
            stdoutPath: result.stdoutPath,
            stderrPath: result.stderrPath
          };
          commandResults.push(commandResult);

          if (isTestOutputCommand(command.id)) {
            testStdout += await config.readFile(result.stdoutPath);
          }

          yield {
            kind: "progress",
            message: `${command.id} exit=${result.exitCode} stdoutBytes=${result.stdoutBytes ?? 0} stderrBytes=${result.stderrBytes ?? 0}`
          };
        } catch (error) {
          if (isTimeoutError(error)) {
            commandResults.push({
              id: command.id,
              argv: command.argv,
              exitCode: 124,
              durationMs: Date.now() - startedAt,
              stdoutPath: "",
              stderrPath: ""
            });
            timeoutFindings.push(buildMechanicalCommandTimeoutFinding({ commandId: command.id }));
            yield { kind: "progress", message: `${command.id} timeout` };
            continue;
          }
          throw error;
        }
      }

      const diffNameOnly = await computeDiffNameOnly({
        fs: config.gitFs,
        workspaceRoot: config.workspaceRoot,
        baseRef: config.baseRef
      });
      const findings = [
        ...timeoutFindings,
        ...buildFindings({
          commandResults,
          plan: config.plan,
          archetype: config.archetype,
          diffNameOnly,
          testStdout
        })
      ];
      const evidence: MechanicalCheckResult = {
        schemaVersion: "1.0.0",
        runId: config.runId,
        attempt: config.attempt,
        commands: commandResults,
        diffNameOnly,
        findings
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

function commandsFor(config: MechanicalChecksAdapterConfig): readonly MechanicalChecksCommandConfig[] {
  if (config.commands.length > 0) {
    return config.commands;
  }
  if (config.archetype === "cosmetic-tweak") {
    return [
      { id: "verify", argv: ["pnpm", "verify"] },
      { id: "lint", argv: ["pnpm", "lint"] }
    ];
  }
  return [{ id: "verify", argv: ["pnpm", "verify"] }];
}

function isTestOutputCommand(commandId: string): boolean {
  return commandId.includes("verify") || commandId.includes("test");
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
