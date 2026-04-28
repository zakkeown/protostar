import type { ReviewGate } from "@protostar/review";

import { T_MECH, type MechanicalEvalResult } from "./index.js";

export type MechanicalArchetype = "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";

export interface MechanicalScoreInput {
  readonly reviewGate: ReviewGate;
  readonly archetype: MechanicalArchetype;
  readonly buildExitCode: number;
  readonly lintExitCode: number;
  readonly diffNameOnly: readonly string[];
  readonly totalAcCount: number;
  readonly coveredAcCount: number;
}

export function computeMechanicalScores(input: MechanicalScoreInput): MechanicalEvalResult {
  const build = input.buildExitCode === 0 ? 1 : 0;
  const lint = input.lintExitCode === 0 ? 1 : 0;
  const diffSize = input.archetype === "cosmetic-tweak" ? (input.diffNameOnly.length <= 1 ? 1 : 0) : 1;
  const acCoverage = input.totalAcCount === 0 ? 1 : input.coveredAcCount / input.totalAcCount;
  const score = Math.min(build, lint, diffSize, acCoverage);
  const verdict = score >= T_MECH ? "pass" : "fail";

  return {
    verdict,
    score,
    scores: {
      build,
      lint,
      diffSize,
      acCoverage
    }
  };
}
