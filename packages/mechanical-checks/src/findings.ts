import type { MechanicalCheckCommandResult, MechanicalScores, ReviewFinding } from "@protostar/review";

export type MechanicalChecksArchetype = "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";

export interface MechanicalChecksPlanInput {
  readonly tasks: readonly {
    readonly id?: string;
    readonly planTaskId?: string;
    readonly acceptanceTestRefs?: readonly {
      readonly acId: string;
      readonly testFile: string;
      readonly testName: string;
    }[];
  }[];
}

export interface MechanicalScoresInput {
  readonly buildExitCode: number | undefined;
  readonly lintExitCode: number | undefined;
  readonly diffNameOnly: readonly string[];
  readonly archetype: MechanicalChecksArchetype;
  readonly totalAcCount: number;
  readonly coveredAcCount: number;
}

type MechanicalRuleId =
  | "build-failure"
  | "lint-failure"
  | "generic-command-failure"
  | "cosmetic-archetype-violation"
  | "ac-uncovered"
  | "mechanical-command-timeout";

type MechanicalFinding = Omit<ReviewFinding, "ruleId" | "evidence"> & {
  readonly ruleId: MechanicalRuleId;
  readonly evidence: unknown;
};

// v0.1 assumes node:test reporter output and matches AC test names by substring.
// Archetype-specific parsers can replace this once multiple test runners exist.
export function buildFindings(input: {
  readonly commandResults: readonly MechanicalCheckCommandResult[];
  readonly plan: MechanicalChecksPlanInput;
  readonly archetype: MechanicalChecksArchetype;
  readonly diffNameOnly: readonly string[];
  readonly testStdout: string;
}): readonly ReviewFinding[] {
  const findings: MechanicalFinding[] = [];

  for (const result of input.commandResults) {
    if (result.exitCode === 0) continue;
    findings.push(findingForCommandFailure(result));
  }

  if (input.archetype === "cosmetic-tweak" && input.diffNameOnly.length > 1) {
    findings.push({
      ruleId: "cosmetic-archetype-violation",
      severity: "critical",
      summary: `cosmetic-tweak touched ${input.diffNameOnly.length} files; at most one is allowed`,
      evidence: { touchedFiles: [...input.diffNameOnly] }
    });
  }

  for (const task of input.plan.tasks) {
    const taskId = task.planTaskId ?? task.id;
    for (const ref of task.acceptanceTestRefs ?? []) {
      if (!input.diffNameOnly.includes(ref.testFile)) {
        findings.push({
          ruleId: "ac-uncovered",
          severity: "major",
          summary: `acceptance criterion ${ref.acId} is missing its referenced test file`,
          evidence: { acId: ref.acId, missingTestFile: ref.testFile },
          ...(taskId !== undefined ? { repairTaskId: taskId } : {})
        });
        continue;
      }

      if (!input.testStdout.includes(ref.testName)) {
        findings.push({
          ruleId: "ac-uncovered",
          severity: "major",
          summary: `acceptance criterion ${ref.acId} test name did not appear in test output`,
          evidence: { acId: ref.acId, missingTestName: ref.testName },
          ...(taskId !== undefined ? { repairTaskId: taskId } : {})
        });
      }
    }
  }

  return findings as unknown as readonly ReviewFinding[];
}

/**
 * Phase 8 Q-01 / Q-02 numeric mechanical scores.
 *
 * The producer lives in the mechanical-checks domain because this package owns
 * the command, diff, and AC-coverage evidence. Absent build/lint commands score
 * as passing because the archetype did not request that check.
 */
export function computeMechanicalScoresFromFindings(input: MechanicalScoresInput): MechanicalScores {
  const build = input.buildExitCode === undefined ? 1 : input.buildExitCode === 0 ? 1 : 0;
  const lint = input.lintExitCode === undefined ? 1 : input.lintExitCode === 0 ? 1 : 0;
  const diffSize = input.archetype === "cosmetic-tweak" ? (input.diffNameOnly.length <= 1 ? 1 : 0) : 1;
  const acCoverage = input.totalAcCount === 0 ? 1 : input.coveredAcCount / input.totalAcCount;

  return { build, lint, diffSize, acCoverage };
}

export function buildMechanicalCommandTimeoutFinding(input: {
  readonly commandId: string;
}): ReviewFinding {
  return {
    ruleId: "mechanical-command-timeout",
    severity: "critical",
    summary: `mechanical command ${input.commandId} timed out`,
    evidence: { commandId: input.commandId }
  } as unknown as ReviewFinding;
}

function findingForCommandFailure(result: MechanicalCheckCommandResult): MechanicalFinding {
  const ruleId = ruleIdForCommand(result.id);
  return {
    ruleId,
    severity: ruleId === "build-failure" ? "critical" : "major",
    summary: `mechanical command ${result.id} exited with code ${result.exitCode}`,
    evidence: {
      commandId: result.id,
      argv: [...result.argv],
      exitCode: result.exitCode,
      stdoutPath: result.stdoutPath,
      stderrPath: result.stderrPath
    }
  };
}

function ruleIdForCommand(commandId: string): MechanicalRuleId {
  if (commandId.startsWith("verify") || commandId.startsWith("build")) {
    return "build-failure";
  }
  if (commandId.startsWith("lint")) {
    return "lint-failure";
  }
  return "generic-command-failure";
}
