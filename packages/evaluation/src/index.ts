/**
 * Phase 8 Q-03/Q-06/Q-09/Q-11/Q-12 evaluation contract surface.
 *
 * The stage result shape now carries verdict + numeric score, the rubric
 * dimensions are fixed, and the former non-verdict placeholder is intentionally
 * not a stage verdict.
 */
export type EvaluationStageKind = "mechanical" | "semantic" | "consensus";
export type EvaluationStageStatus = "pass" | "fail";
export type EvaluationVerdict = EvaluationStageStatus;
export type EvolutionAction = "continue" | "converged" | "exhausted";

export const ONTOLOGY_CONVERGENCE_THRESHOLD = 0.95;
export const MAX_EVOLUTION_GENERATIONS = 30;
export const EVALUATION_RUBRIC_DIMENSIONS = [
  "acMet",
  "codeQuality",
  "security",
  "regressionRisk",
  "releaseReadiness"
] as const;
export type EvaluationRubricDimension = typeof EVALUATION_RUBRIC_DIMENSIONS[number];

export const T_MECH = 0.95 as const;
export const T_CONF = 0.85 as const;
export const T_MEAN_JUDGES = 0.85 as const;
export const T_MIN_JUDGES = 0.85 as const;
export const T_MEAN_DIMS = 0.85 as const;
export const T_MIN_DIMS = 0.85 as const;

export interface EvaluationStageResult {
  readonly stage: EvaluationStageKind;
  readonly verdict: EvaluationStageStatus;
  readonly score: number;
  readonly scores?: Readonly<Record<string, number>>;
  readonly summary: string;
}

export interface EvaluationReport {
  readonly runId: string;
  readonly verdict: EvaluationStageStatus;
  readonly stages: readonly EvaluationStageResult[];
}

export interface MechanicalEvalResult {
  readonly verdict: EvaluationStageStatus;
  readonly score: number;
  readonly scores: {
    readonly build: number;
    readonly lint: number;
    readonly diffSize: number;
    readonly acCoverage: number;
  };
}

export interface JudgePerDimensionScores {
  readonly judgeId: string;
  readonly model: string;
  readonly rubric: Readonly<Record<EvaluationRubricDimension, number>>;
}

export interface SemanticEvalResult {
  readonly verdict: EvaluationStageStatus;
  readonly score: number;
  readonly confidence: number;
  readonly judges: readonly JudgePerDimensionScores[];
}

export interface ConsensusBreakdown {
  readonly judgeMeans: readonly number[];
  readonly dimMeans: Readonly<Record<EvaluationRubricDimension, number>>;
  readonly meanOfJudgeMeans: number;
  readonly minOfJudgeMeans: number;
  readonly meanOfDimMeans: number;
  readonly minOfDimMeans: number;
  readonly thresholds: {
    readonly tMeanJudges: number;
    readonly tMinJudges: number;
    readonly tMeanDims: number;
    readonly tMinDims: number;
  };
  readonly thresholdsHit: readonly string[];
}

export interface ConsensusEvalResult {
  readonly verdict: EvaluationStageStatus;
  readonly score: number;
  readonly breakdown: ConsensusBreakdown;
  readonly judges: readonly JudgePerDimensionScores[];
}

export interface OntologyField {
  readonly name: string;
  readonly type: string;
  readonly description?: string;
}

export interface OntologySnapshot {
  readonly generation: number;
  readonly fields: readonly OntologyField[];
}

export interface OntologySimilarity {
  readonly score: number;
  readonly nameOverlap: number;
  readonly typeMatch: number;
  readonly exactMatch: number;
  readonly threshold: number;
}

export interface EvolutionDecision {
  readonly action: EvolutionAction;
  readonly generation: number;
  readonly similarity?: OntologySimilarity;
  readonly reason: string;
}

export function measureOntologySimilarity(
  previous: OntologySnapshot,
  current: OntologySnapshot,
  threshold = ONTOLOGY_CONVERGENCE_THRESHOLD
): OntologySimilarity {
  const previousByName = new Map(previous.fields.map((field) => [field.name, field]));
  const currentByName = new Map(current.fields.map((field) => [field.name, field]));
  const names = new Set([...previousByName.keys(), ...currentByName.keys()]);
  const sharedNames = [...previousByName.keys()].filter((name) => currentByName.has(name));

  if (names.size === 0) {
    return {
      score: 1,
      nameOverlap: 1,
      typeMatch: 1,
      exactMatch: 1,
      threshold
    };
  }

  const nameOverlap = roundScore(sharedNames.length / names.size);
  const typeMatch = sharedNames.length === 0
    ? 0
    : roundScore(
        sharedNames.filter((name) => previousByName.get(name)?.type === currentByName.get(name)?.type).length /
          sharedNames.length
      );
  const exactMatch = sharedNames.length === 0
    ? 0
    : roundScore(
        sharedNames.filter((name) => {
          const previousField = previousByName.get(name);
          const currentField = currentByName.get(name);
          if (previousField === undefined || currentField === undefined) {
            return false;
          }
          return (
            previousField.type === currentField.type &&
            (previousField.description ?? "") === (currentField.description ?? "")
          );
        }).length / sharedNames.length
      );
  const score = roundScore(0.5 * nameOverlap + 0.3 * typeMatch + 0.2 * exactMatch);

  return {
    score,
    nameOverlap,
    typeMatch,
    exactMatch,
    threshold
  };
}

export function decideEvolution(input: {
  readonly current: OntologySnapshot;
  readonly previous?: OntologySnapshot;
  readonly maxGenerations?: number;
  readonly threshold?: number;
}): EvolutionDecision {
  const maxGenerations = input.maxGenerations ?? MAX_EVOLUTION_GENERATIONS;
  const threshold = input.threshold ?? ONTOLOGY_CONVERGENCE_THRESHOLD;

  if (input.current.generation >= maxGenerations) {
    return {
      action: "exhausted",
      generation: input.current.generation,
      reason: `Reached generation cap ${maxGenerations}.`
    };
  }

  if (input.previous === undefined) {
    return {
      action: "continue",
      generation: input.current.generation,
      reason: "No previous ontology snapshot exists yet."
    };
  }

  const similarity = measureOntologySimilarity(input.previous, input.current, threshold);
  if (similarity.score >= threshold) {
    return {
      action: "converged",
      generation: input.current.generation,
      similarity,
      reason: `Ontology similarity ${similarity.score.toFixed(2)} reached threshold ${threshold.toFixed(2)}.`
    };
  }

  return {
    action: "continue",
    generation: input.current.generation,
    similarity,
    reason: `Ontology similarity ${similarity.score.toFixed(2)} is below threshold ${threshold.toFixed(2)}.`
  };
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

export * from "./compute-mechanical-scores.js";
export * from "./compute-semantic-confidence.js";
export * from "./create-evaluation-report.js";
export * from "./create-spec-ontology-snapshot.js";
export * from "./evaluate-consensus.js";
export * from "./evaluation-pile-result.js";
export * from "./lineage-hash.js";
export * from "./should-run-consensus.js";
