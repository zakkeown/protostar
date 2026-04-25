import type { ReviewGate, ReviewVerdict } from "@protostar/review";

export type EvaluationStageKind = "mechanical" | "semantic" | "consensus";
export type EvaluationStageStatus = "passed" | "failed" | "skipped";
export type EvaluationVerdict = ReviewVerdict;
export type EvolutionAction = "continue" | "converged" | "exhausted";

export const ONTOLOGY_CONVERGENCE_THRESHOLD = 0.95;
export const MAX_EVOLUTION_GENERATIONS = 30;

export interface EvaluationStageResult {
  readonly stage: EvaluationStageKind;
  readonly status: EvaluationStageStatus;
  readonly summary: string;
}

export interface EvaluationReport {
  readonly runId: string;
  readonly verdict: EvaluationVerdict;
  readonly stages: readonly EvaluationStageResult[];
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

export function createEvaluationReport(input: {
  readonly runId: string;
  readonly reviewGate: ReviewGate;
}): EvaluationReport {
  const mechanicalStatus = input.reviewGate.verdict === "pass" ? "passed" : "failed";

  return {
    runId: input.runId,
    verdict: input.reviewGate.verdict,
    stages: [
      {
        stage: "mechanical",
        status: mechanicalStatus,
        summary:
          input.reviewGate.verdict === "pass"
            ? "Mechanical review gate passed."
            : `Mechanical review gate returned ${input.reviewGate.verdict}.`
      },
      {
        stage: "semantic",
        status: "skipped",
        summary: "Semantic evaluation is stubbed behind the mechanical gate."
      },
      {
        stage: "consensus",
        status: "skipped",
        summary: "Multi-model consensus is stubbed until semantic uncertainty is available."
      }
    ]
  };
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
